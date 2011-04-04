// youknow backend main entry point

var fs = require('fs'), http = require('http'),
    LOG = require('./lib/common').LOG,
    manager = new (require('./lib/manager'))();

var config, frontends, files = {};

function encode(str) {
  return encodeURI(str).replace(/'/g, '%27').replace(/"/g, '%22');
}
function decode(str) {
  return decodeURI(str);
}
function entities(encodedStr) {
  return encodedStr.replace(/%(.{2})/g, function(s, v) {
    return '&#' + parseInt(v, 16);
  });
}
function ISODateString(d) {
 function pad(n) { return (n < 10 ? '0' + n : n); }
 return d.getUTCFullYear() + '-'
        + pad(d.getUTCMonth() + 1) + '-'
        + pad(d.getUTCDate()) + 'T'
        + pad(d.getUTCHours()) + ':'
        + pad(d.getUTCMinutes()) + ':'
        + pad(d.getUTCSeconds()) + 'Z'
}
var fuzzyDate = (function(){
  fuzzyTime.defaultOptions={
    // time display options
    relativeTime : 48,
    // language options
    monthNames : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    amPm : ['AM', 'PM'],
    ordinalSuffix : function(n) {return ['th','st','nd','rd'][n<4 || (n>20 && n % 10<4) ? n % 10 : 0]}
  }
  function fuzzyTime(timeValue, options) {
    var options=options||fuzzyTime.defaultOptions,
        isoTimeValue=ISODateString(timeValue),
        date=parseDate(isoTimeValue),
        delta=parseInt(((new Date()).getTime()-date.getTime())/1000),
        relative=options.relativeTime,
        cutoff=+relative===relative ? relative*60*60 : Infinity;
    if (relative===false || delta>cutoff)
      return formatTime(date, options)+' '+formatDate(date, options);
    if (delta<60) return 'less than a minute ago';
    var minutes=parseInt(delta/60 +0.5);
    if (minutes <= 1) return 'about a minute ago';
    var hours=parseInt(minutes/60 +0.5);
    if (hours<1) return minutes+' minutes ago';
    if (hours==1) return 'about an hour ago';
    var days=parseInt(hours/24 +0.5);
    if (days<1) return hours+' hours ago';
    if (days==1) return formatTime(date, options)+' yesterday';
    var weeks=parseInt(days/7 +0.5);
    if (weeks<2) return formatTime(date, options)+' '+days+' days ago';
    var months=parseInt(weeks/4.34812141 +0.5);
    if (months<2) return weeks+' weeks ago';
    var years=parseInt(months/12 +0.5);
    if (years<2) return months+' months ago';
    return years+' years ago';
  }
  function parseDate(str) {
    var v=str.replace(/[T\+]/g,' ').split(' ');
    return new Date(Date.parse(v[0] + " " + v[1] + " UTC"));
  }
  function formatTime(date, options) {
    var h=date.getHours(), m=''+date.getMinutes(), am=options.amPm;
    return (h>12 ? h-12 : h)+':'+(m.length==1 ? '0' : '' )+m+' '+(h<12 ? am[0] : am[1]);
  }
  function formatDate(date, options) {
    var mon=options.monthNames[date.getMonth()],
        day=date.getDate(),
        year=date.getFullYear(),
        thisyear=(new Date()).getFullYear(),
        suf=options.ordinalSuffix(day);
    return mon+' '+day+suf+(thisyear!=year ? ', '+year : '');
  }
  return fuzzyTime;
}());

config = JSON.parse(fs.readFileSync(__dirname + '/config.json', 'utf8'));
files['main_begin'] = fs.readFileSync(__dirname + '/html/main_begin.htm');
files['main_end'] = fs.readFileSync(__dirname + '/html/main_end.htm');
files['info_begin'] = fs.readFileSync(__dirname + '/html/info_begin.htm');
files['info_end'] = fs.readFileSync(__dirname + '/html/info_end.htm');
files['owner'] = fs.readFileSync(__dirname + '/images/owner.png');

frontends = config.frontends;
if (!frontends || !Array.isArray(frontends) || frontends.length === 0)
  throw new Error('You must specify at least one frontend to use');
if (!config.infoPort || typeof config.infoPort !== 'number')
  throw new Error('You must specify a port number for the game session info server');

/* Initialize all enabled frontends */
for (var i=0; i<frontends.length; i++) {
  (function(name) {
    files['icon_' + name] = fs.readFileSync(__dirname + '/lib/frontends/' + name + '/icon.png');
    frontends[i] = new (require('./lib/frontends/' + name))(manager, function(msg, level) {
      if (level === LOG.ERROR)
        console.error(name.toUpperCase() + ' :: ERROR :: ' + msg);
      else if (level === LOG.DEBUG)
        console.log(name.toUpperCase() + ' :: DEBUG :: ' + msg);
      else if (level === LOG.INFO)
        console.log(name.toUpperCase() + ' :: INFO :: ' + msg);
    });
  })(frontends[i].toLowerCase());
  frontends[i].init();
  console.log('MAIN :: INFO :: Initialized frontend: ' + frontends[i].name);
}

/* Game session information server */
var infoServer = http.createServer(function(req, res) {
  var icon;

  if (req.url === '/') {
    var gameNames = Object.keys(manager.games);
    if (gameNames.length > 0) {
      res.writeHead(200, {'Content-Type': 'text/html'});
      res.write(files['main_begin']);
      var game, name, sp = '          ';
      for (var i=0,game,len=gameNames.length; i<len; ++i) {
        game = manager.games[gameNames[i]];
        name = encode(game.name);
        status = (game.state === 'pregame' ? 'Waiting for players' : 'In progress');
        res.write(sp + '<tr>\n');
        res.write(sp + '  <td><a href="/info/' + name + '">' + entities(name) + '</a></td>\n');
        res.write(sp + '  <td>' + status + '</td>\n');
        res.write(sp + '  <td style="text-align: center;">' + game.players.length + '</td>\n');
        res.write(sp + '</tr>\n');
      }
      res.write(files['main_end']);
    } else {
      res.writeHead(200, {'Content-Type': 'text/plain'});
      res.write('No games available');//res.write(files['nogames']);
    }
  } else if (req.url.indexOf('/info/') === 0 && req.url.length > 6) {
    res.writeHead(200, {'Content-Type': 'text/html'});
    var name = decodeURIComponent(req.url.substring(6)), game;
    // Cheat and use the manager's games object directly :-)
    if (game = manager.games[name.toLowerCase()]) {
      res.write(files['info_begin']);
      var sp = '          ',
          status = (game.state === 'pregame' ? 'Waiting for players' : 'In progress'),
          dateCreated = new Date(game.tsCreate),
          dateStarted = (game.state === 'pregame' ? undefined : new Date(game.tsStart));
      res.write(sp + '<tr>\n');
      res.write(sp + '  <td class="header">Name:</td>\n');
      res.write(sp + '  <td>' + entities(encode(game.name)) + '</td>\n');
      res.write(sp + '</tr>\n');
      res.write(sp + '<tr>\n');
      res.write(sp + '  <td class="header">Status:</td>\n');
      res.write(sp + '  <td>' + status + '</td>\n');
      res.write(sp + '</tr>\n');
      res.write(sp + '<tr>\n');
      res.write(sp + '  <td class="header">Created:</td>\n');
      res.write(sp + '  <td title="' + ISODateString(dateCreated) + '" alt="' +
                ISODateString(dateCreated) + '">' + fuzzyDate(dateCreated) +
                '</td>\n');
      res.write(sp + '</tr>\n');
      res.write(sp + '<tr>\n');
      res.write(sp + '  <td class="header">Started:</td>\n');
      res.write(sp + '  <td' + (dateStarted ? ' title="' +
                ISODateString(dateStarted) + '" alt="' + ISODateString(dateStarted) +
                '"' : '') + '>' + (dateStarted ? fuzzyDate(dateStarted) : 'N/A') + '</td>\n');
      res.write(sp + '</tr>\n');
      res.write(sp + '<tr>\n');
      res.write(sp + '  <td class="header">Players:</td>\n');
      res.write(sp + '  <td>\n');
      res.write(sp + '    <ul>\n');
      for (var i=0,pinfo,type,dateJoin,len=game.players.length; i<len; ++i) {
        dateJoin = new Date(game.players[i].tsJoin);
        pinfo = '<img src="/frontend_' + game.players[i].type.toLowerCase() +
                '.png" alt="' + game.players[i].type + '" title="' +
                game.players[i].type + '" /> ' +
                entities(encode(game.players[i].name)) + ' - Joined: <span title="' +
                ISODateString(dateJoin) + '" alt="' + ISODateString(dateJoin) + '">' +
                fuzzyDate(dateJoin) + '</span>';
        type = (game.owner === game.players[i] ? ' class="owner"' : '');
        res.write(sp + '      <li' + type + '>' + pinfo + '</li>\n');
      }
      res.write(sp + '    </ul>\n');
      res.write(sp + '  </td>\n');
      res.write(sp + '</tr>\n');
      res.write(files['info_end']);
    } else {
      res.writeHead(404, {'Content-Type': 'text/plain'});
      res.write('A game with that name does not exist');
    }
  } else if ((icon = req.url.match(/\/frontend_([a-zA-Z]+)\.png/)) &&
             files['icon_' + icon[1]]) {
    res.writeHead(200, {'Content-Type': 'image/png'});
    res.write(files['icon_' + icon[1]]);
  } else if (req.url === '/owner.png') {
    res.writeHead(200, {'Content-Type': 'image/png'});
    res.write(files['owner']);
  } else
    res.writeHead(404);
  res.end();
});
infoServer.listen(config.infoPort);
console.log('MAIN :: INFO :: Game session info server started on port ' + config.infoPort);