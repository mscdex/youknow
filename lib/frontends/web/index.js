var interfaceName = 'Web';

var http = require('http'),
    fs = require('fs'),
    util = require('util');
var io = require('socket.io'),
    common = require('../../common');

var localFiles = {},
    config,
    port,
    LOG = common.LOG,
    CARD_TYPE = common.CARD_TYPE,
    CARD_VALUE = common.CARD_VALUE;

var WebPlayer = function(name, game) {
  common.Player.call(this, name, game);
  this.type = interfaceName;
};
util.inherits(WebPlayer, common.Player);

WebPlayer.prototype.handleEvent = function(event, arg1, arg2, arg3) {
  var msg = {};
  msg.event = event;
  if (event === 'start') {
    if (arg3) {
      msg.roundWinner = { name: arg3.name, type: arg3.type, id: arg3.id,
                          points: arg3.points };
    }
    msg.startPlayer = { name: arg1.name, type: arg1.type, id: arg1.id };
    msg.topCard = arg2;
    msg.hand = this.hand;
  } else if (event === 'playerjoin')
    msg.player = { name: arg1.name, type: arg1.type, id: arg1.id };
  else if (event === 'playerquit') {
    msg.player = { name: arg1.name, type: arg1.type, id: arg1.id };
    if (arg2)
      msg.newOwner = { name: arg2.name, type: arg2.type, id: arg2.id };
  } else if (event === 'play') {
    msg.player = { name: arg1.name, type: arg1.type, id: arg1.id };
    msg.card = arg2;
    if (typeof arg3 !== 'undefined')
      msg.wildColor = arg3;
  } else if (event === 'turn')
    msg.player = { name: arg1.name, type: arg1.type, id: arg1.id };
  else if (event === 'draw') {
    msg.player = { name: arg1.name, type: arg1.type, id: arg1.id };
    if (arg1 === this)
      msg.drawnCards = arg1.hand.slice(-1 * arg2);
    msg.numCards = arg2;
  } else if (event === 'pass')
    msg.player = { name: arg1.name, type: arg1.type, id: arg1.id };
  else if (event === 'youknow')
    msg.player = { name: arg1.name, type: arg1.type, id: arg1.id };
  else if (event === 'end') {
    if (arg1) {
      msg.player = { name: arg1.name, type: arg1.type, id: arg1.id,
                     points: arg1.points };
    }
  } else
    return;

  this.userData.emit('data', JSON.stringify(msg));
};
// =============================================================================
var GameInterface = module.exports = function(manager, fnLog) {
  this.name = interfaceName;
  this.manager = manager;
  this.log = (typeof fnLog === 'function' ? fnLog : function() {});
  this.server = undefined;

  // Load core assets
  var pubPath = __dirname + '/public',
      imgPath = pubPath + '/images';
  localFiles['index.htm'] = fs.readFileSync(pubPath + '/index.htm');
  localFiles['style.css'] = fs.readFileSync(pubPath + '/style.css');
  localFiles['style.ie6.css'] = fs.readFileSync(pubPath + '/style.ie6.css');
  localFiles['game.js'] = fs.readFileSync(pubPath + '/game.js');
  localFiles['jquery.simplemodal.js'] = fs.readFileSync(pubPath + '/jquery.simplemodal.js');
  this.config = JSON.parse(fs.readFileSync(__dirname + '/config.json', 'utf8'));

  // Game card art
  for (var color=0; color < 4; color++) {
    var pathPrefix = imgPath + '/' + color + '_';
    for (var i=0; i<13; ++i)
      localFiles['images/' + color + '_' + i + '.png'] = fs.readFileSync(pathPrefix + i + '.png');
  };
  localFiles['images/4.png'] = fs.readFileSync(imgPath + '/4.png');
  localFiles['images/5.png'] = fs.readFileSync(imgPath + '/5.png');
  localFiles['images/back.png'] = fs.readFileSync(imgPath + '/back.png');

  // Other UI art
  localFiles['images/cards.png'] = fs.readFileSync(imgPath + '/cards.png');
  localFiles['images/player.png'] = fs.readFileSync(imgPath + '/player.png');
  localFiles['images/owner.png'] = fs.readFileSync(__dirname + '/../../../images/owner.png');

  if (!this.config.port)
    throw new Error('You must specify a port for the Grappler server');
};

GameInterface.prototype.init = function() {
  var self = this,
      manager = this.manager;

  this.server = http.createServer(function(req, res) {
    var file = req.url.substr(1),
        ext = file.substr(file.lastIndexOf('.')+1),
        type = 'application/octet-stream';

    if (req.url === '/') {
      file = 'index.htm';
      ext = 'htm';
    }
    if (localFiles[file]) {
      if (ext === 'js')
        type = 'text/javascript';
      else if (ext === 'css')
        type = 'text/css';
      else if (ext === 'swf')
        type = 'application/x-shockwave-flash';
      else if (ext === 'htm')
        type = 'text/html';
      else if (ext === 'png')
        type = 'image/png';

      res.writeHead(200, {
        'Connection': 'close',
        'Content-Type': type,
        'Content-Length': localFiles[file].length
      });
      res.end(localFiles[file]);
    }
  });
  io = io.listen(this.server, {log: false});

  io.sockets.on('connection', function(socket) {
    self.log('Player connected from ' + socket.handshake.address.address, LOG.DEBUG);

    socket.on('data', function(data) {
      var cmd,
          args = '',
          argpos = data.indexOf(' '),
          ret,
          res = {};
      if (argpos > -1) {
        cmd = data.substring(0, argpos);
        args = data.substring(argpos + 1);
      } else
        cmd = data;

      if (cmd === 'register' && args.length) {
        // Assign user name
        if (!socket.nick) {
          ret = manager.validatePlayerName(args);
          if (typeof ret === 'string')
            res.error = ret;
          else if (typeof ret === 'boolean' && ret)
            socket.nick = args;
        } else
          res.error = 'You have already selected a user name: ' + socket.nick;
      } else if (socket.nick) {
        if (cmd === 'start') {
          // Start owned game
          ret = manager.findGameNameByOwner(function(p) {
                  return p.userData === socket;
                }, WebPlayer);
          if (!ret)
            res.error = 'You cannot start a game that you aren\'t the owner of';
          else {
            ret = manager.startGame(ret);
            if (typeof ret === 'string')
              res.error = ret;
            else if (!ret)
              res.error = 'You need at least 2 people to start the game';
          }
        } else if (cmd === 'leave') {
          // Leave current game
          ret = manager.delPlayer(function(p) {
                  return p.userData === socket;
                }, WebPlayer);
          if (typeof ret === 'string')
            res.error = ret;
          else
            ret = true;
        } else if (cmd === 'draw') {
          // Draw a card from draw pile
          ret = manager.draw(function(p) { return p.userData === socket; },
                             WebPlayer);
          if (typeof ret === 'string')
            res.error = ret;
          else if (!ret)
            res.error = 'You cannot draw while not in a game';
        } else if (cmd === 'pass') {
          // Pass after drawing a card
          ret = manager.pass(function(p) { return p.userData === socket; },
                             WebPlayer);
          if (typeof ret === 'string')
            res.error = ret;
          else if (!ret)
            res.error = 'You cannot pass while not in a game';
        } else if (cmd === 'create') {
          if (!args.length) {
            // Create a random game name
            args = 'youknow' + Date.now();
          }
          ret = manager.addGame(args, socket.nick, WebPlayer, socket,
                                socket._id);
          if (typeof ret === 'string')
            res.error = ret;
          else {
            ret = {
              gameName: args,
              me: {
                name: ret.owner.name,
                type: ret.owner.type,
                id: ret.owner.id
              }
            };
          }
        } else if (cmd === 'join' && args.length) {
          ret = manager.addPlayer(args, socket.nick, WebPlayer, socket,
                                  socket._id);
          if (typeof ret === 'string')
            res.error = ret;
          else {
            var msg = {},
                players = manager.getPlayers(args, undefined,
                                             function(p) {
                                               return p.userData !== socket;
                                             });
            if (players.length) {
              msg.players = [];
              for (var i=0,len=players.length; i<len; ++i) {
                msg.players.push({
                  name: players[i].name,
                  type: players[i].type,
                  id: players[i].id
                });
              }
            }
            msg.ownerId = ret.game.owner.id;
            msg.me = { name: ret.name, type: ret.type, id: ret.id };
            ret = msg;
          }
        } else if (cmd === 'play' && args.length) {
          args = args.split(' ');
          var card = parseInt(args[0]), wildColor;
          if (!isNaN(card)) {
            if (args.length > 1)
              wildColor = args[1];
            ret = manager.play(function(p) {
                    return p.userData === socket;
                  }, WebPlayer, card, wildColor);
            if (typeof ret === 'string')
              res.error = ret;
            else
              ret = true;
          } else
            res.error = 'Invalid card';
        } else
          res.error = 'Invalid command';
      } else
        res.error = 'You must register a user name first';

      if (typeof res.error === 'undefined')
        res.ret = ret;
      socket.emit('data', JSON.stringify(res));
    });
    socket.on('disconnect', function() {
      self.log('Player disconnected from ' + socket.handshake.address.address, LOG.DEBUG);
      manager.delPlayer(function(p) { return p.userData === socket; }, WebPlayer);
    });
  });

  // Listen for incoming connections
  this.server.listen(this.config.port);
  this.log('Socket.IO server listening on port ' + this.config.port, LOG.INFO);
};