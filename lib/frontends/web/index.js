var interfaceName = 'Web';

var fs = require('fs'),
    util = require('util'),
    grappler = require('./grappler/lib/grappler'),
    common = require('../../common');
    grappler.common = require('./grappler/lib/common');

var localFiles = {}, config, port,
    LOG = common.LOG, CARD_TYPE = common.CARD_TYPE,
    CARD_VALUE = common.CARD_VALUE;

var WebPlayer = function(name, game) {
  common.Player.call(this, name, game);
  this.type = interfaceName;
};
util.inherits(WebPlayer, common.Player);
WebPlayer.prototype.handleEvent = function(event, arg1, arg2, arg3) {
  var msg = new Object();
  msg.event = event;
  if (event === 'start') {
    //ret.on('start', function(startPlayer, topCard, roundWinner) {
    if (arg3)
      msg.roundWinner = { name: arg3.name, type: arg3.type };
    msg.startPlayer = { name: arg1.name, type: arg1.type };
    msg.topCard = arg2;
    msg.hand = this.hand;
  } else if (event === 'start_after') {
    //ret.on('start_after', function(startPlayer, topCard, roundWinner) {
    if (arg1 instanceof WebPlayer) {
      // Just a helpful notification in case multiple users have the same name
      msg = new Object();
      msg.go = true;
      arg1.userData.write(JSON.stringify(msg));
    }
    return;
  } else if (event === 'playerjoin') {
    //ret.on('playerjoin', function(player) {
    msg.player = { name: arg1.name, type: arg1.type };
  } else if (event === 'playerquit') {
    //ret.on('playerquit', function(player, newOwner) {
    msg.player = { name: arg1.name, type: arg1.type };
    if (arg2)
      msg.newOwner = { name: arg2.name, type: arg2.type };
  } else if (event === 'play') {
    //ret.on('play', function(player, card, wildColor) {
    msg.player = { name: arg1.name, type: arg1.type };
    msg.card = card;
    if (typeof wildColor !== 'undefined')
      msg.wildColor = wildColor;
  } else if (event === 'turn') {
    //ret.on('turn', function(curPlayer) {
    msg.player = { name: arg1.name, type: arg1.type };
  } else if (event === 'turn_after') {
    //ret.on('turn_after', function(curPlayer) {
    if (arg1 instanceof WebPlayer) {
      // Just a helpful notification in case multiple users have the same name
      msg = new Object();
      msg.go = true;
      arg1.userData.write(JSON.stringify(msg));
    }
    return;
  } else if (event === 'draw') {
    //ret.on('draw', function(player, numCards) {
    msg.player = { name: arg1.name, type: arg1.type };
    msg.numCards = numCards;
  } else if (event === 'draw_after') {
    //ret.on('draw_after', function(player, numCards) {
    if (arg1 instanceof WebPlayer) {
      // Let the user know what cards they got
      msg = new Object();
      // Drawn cards are always added to the end
      msg.drawnCards = arg1.hand.slice(-1 * numCards);
      arg1.userData.write(JSON.stringify(msg));
    }
    return;
  } else if (event === 'pass') {
    //ret.on('pass', function(player) {
    msg.player = { name: arg1.name, type: arg1.type };
  } else if (event === 'youknow') {
    //ret.on('youknow', function(player) {
    msg.player = { name: arg1.name, type: arg1.type };
  } else if (event === 'end') {
    //ret.on('end', function(gameWinner) {
    if (arg1)
      msg.player = { name: arg1.name, type: arg1.type };
  } else
    return;

  this.userData.write(JSON.stringify(msg));
};
// =============================================================================
var GameInterface = module.exports = function(manager, fnLog) {
  this.name = interfaceName;
  this.manager = manager;
  this.log = (typeof fnLog === 'function' ? fnLog : function() {});
  this.server = undefined;

  // Load assets
  try {
    var pubPath = __dirname + '/public',
        imgPath = pubPath + '/images';
    localFiles['index.htm'] = fs.readFileSync(pubPath + '/index.htm');
    localFiles['flashws.js'] = fs.readFileSync(pubPath + '/flashws.js');
    localFiles['transport.js'] = fs.readFileSync(pubPath + '/transport.js');
    localFiles['WebSocketMain.swf'] = fs.readFileSync(pubPath + '/WebSocketMain.swf');
    this.config = JSON.parse(fs.readFileSync(__dirname + '/config.json', 'utf8'));

    // Game card art
    localFiles['images/back.png'] = fs.readFileSync(imgPath + '/back.png');
    localFiles['images/wild.png'] = fs.readFileSync(imgPath + '/wild.png');
    localFiles['images/wild_draw4.png'] = fs.readFileSync(imgPath + '/wild_draw4.png');
    ['red', 'blue', 'yellow', 'green'].forEach(function(color) {
      var pathPrefix = imgPath + '/' + color + '_';
      for (var i=0; i<10; ++i)
        localFiles['images/' + color + '_' + i + '.png'] = fs.readFileSync(pathPrefix + i + '.png');
      localFiles['images/' + color + '_draw2.png'] = fs.readFileSync(pathPrefix + 'draw2.png');
      localFiles['images/' + color + '_skip.png'] = fs.readFileSync(pathPrefix + 'skip.png');
      localFiles['images/' + color + '_reverse.png'] = fs.readFileSync(pathPrefix + 'reverse.png');
    });
  } catch (err) {
    throw new Error('An error occurred while reading assets: ' + err);
  }

  if (!this.config.port)
    throw new Error('You must specify a port for the Grappler server');
};

GameInterface.prototype.init = function() {
  var self = this, manager = this.manager;
  // Create a new instance of a grappler server
  this.server = new grappler.Server({ /*logger: self.log*/ }, function(req, res) {
    // We don't care to filter WebSocket connections (e.g. check validity of cookies, etc)
    if (req.headers.upgrade)
      return;

    var file = req.url.substr(1),
        ext = file.substr(file.lastIndexOf('.')+1),
        type = 'application/octet-stream';
    if (localFiles[file]) {
      if (ext === 'js')
        type = 'text/javascript';
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
    } else if (file.length) {
      res.writeHead(404, { 'Connection': 'close' });
      res.end();
    }
  });

  // Listen for an incoming connection
  this.server.on('connection', function(client) {
    var type;
    if (client.state & grappler.common.STATE.PROTO_WEBSOCKET)
      type = "WebSocket";
    else if (client.state & grappler.common.STATE.PROTO_HTTP)
      type = "HTTP";
    else
      type = "Unknown";

    self.log(type + ' client connected from ' + client.remoteAddress, LOG.DEBUG);

    client.on('message', function(msg) {
      var text = '';
      msg.on('data', function(data) {
        text += data;
      });
      msg.on('end', function() {
        var cmd, args = '', argpos = text.indexOf(' '), ret, res = new Object();
        if (argpos > -1) {
          cmd = text.substring(0, argpos);
          args = text.substring(argpos+1);
        } else
          cmd = text;

        if (cmd === 'register' && args.length) {
          // Assign user name
          if (!client.nick) {
            ret = manager.validatePlayerName(args);
            if (typeof ret === 'string')
              res.error = ret;
            else if (typeof ret === 'boolean' && ret)
              client.nick = args;
          } else
            res.error = 'You have already selected a user name: ' + client.nick;
        } else if (client.nick) {
          if (cmd === 'start') {
            // Start owned game
            ret = manager.findGameNameByOwner(function(p) {
                    return p.userData === client;
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
                    return p.userData === client;
                  }, WebPlayer);
            if (typeof ret === 'string')
              res.error = ret;
            else
              ret = true;
          } else if (cmd === 'draw') {
            // Draw a card from draw pile
            ret = manager.draw(function(p) { return p.userData === client; },
                               WebPlayer);
            if (typeof ret === 'string')
              res.error = ret;
            else if (!ret)
              res.error = 'You cannot draw while not in a game';
          } else if (cmd === 'pass') {
            // Pass after drawing a card
            ret = manager.pass(function(p) { return p.userData === client; },
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
            ret = manager.addGame(args, client.nick, WebPlayer, client);
            if (typeof ret === 'string')
              res.error = ret;
            else
              ret = args;
          } else if (cmd === 'join' && args.length) {
            ret = manager.addPlayer(args, client.nick, WebPlayer, client);
            if (typeof ret === 'string')
              res.error = ret;
            else {
              ret = 'Joined game with: ' +
                    manager.getPlayerNames(args, undefined, function(p) {
                      return p.userData !== client;
                    }).join(', ');
            }
          } else if (cmd === 'play' && args.length) {
            args = args.split(' ');
            var card = parseInt(args[0]), wildColor;
            if (!isNaN(card)) {
              if (args.length > 1)
                wildColor = args[1];
              ret = manager.play(function(p) {
                      return p.userData === client;
                    }, WebPlayer, card-1, wildColor);
              if (typeof ret === 'string')
                res.error = ret;
              else
                return;
            } else
              res.error = 'Invalid card';
          } else {
            // Invalid command
            res.error = 'Invalid command';
          }
        } else
          res.error = 'You must register a user name first';

        if (typeof res.error === 'undefined')
          res.ret = ret;
        client.write(JSON.stringify(res));
      });
    });
    client.on('end', function() {
      self.log(type + ' client disconnected from ' + client.remoteAddress, LOG.DEBUG);
      manager.delPlayer(function(p) { return p.userData === client; }, WebPlayer);
    });
  });

  this.server.listen(this.config.port);
  this.log('Grappler server listening on port ' + this.config.port, LOG.INFO);
};