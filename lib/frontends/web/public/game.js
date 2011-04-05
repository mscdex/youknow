var conn, callback, players = {}, me, imgBack = 'images/back.png',
    inGame = false, isNewRound = false, isWild = false, elWild;

/* Game functions */
function addPlayer(p) {
  players[p.id] = p;
  $('#players').append('<div class="player ' + p.type.toLowerCase() + '" id="player-' + p.id + '">' + p.name + '<div class="cardcount"></div></div>');
}
function delPlayer(p) {
  delete players[p.id];
  $('#player-' + p.id).remove();
}
function addCardCount(id, amt) {
  if (id) {
    var numCards = parseInt($('#player-' + id + ' div.cardcount').text());
    if (isNaN(numCards))
      numCards = 0;
    $('#player-' + id + ' div.cardcount').html('<img src="images/cards.png" /> ' + (numCards += amt));
  } else
    $('div.cardcount').html('<img src="images/cards.png" /> ' + amt);
}
function cardToImage(card) {
  if (card[0] < 4)
    return 'images/' + card[0] + '_' + card[1] + '.png';
  else
    return 'images/' + card[0] + '.png';
}
function colorToText(color) {
  var text;
  if (color === 0)
    text = 'blue';
  else if (color === 1)
    text = 'green';
  else if (color === 2)
    text = 'red';
  else if (color === 3)
    text = 'yellow';
  return text;
}
function cardToText(card) {
  var text;
  if (card[0] < 4) {
    text = colorToText(card[0]);

    if (card[1] < 10)
      text += ' ' + card[1];
    else if (card[1] === 10)
      text += ' draw 2';
    else if (card[1] === 11)
      text += ' reverse';
    else if (card[1] === 12)
      text += ' skip';
  } else if (card[0] === 4)
    text = 'Wild';
  else if (card[0] === 5)
    text = 'Wild Draw 4';
  return text;
}
function imageToCard(src) {
  src = src.substring(src.lastIndexOf('/')+1);
  var idxSep = src.indexOf('_'), idxEnd = src.indexOf('.');
  if (idxSep === -1)
    return [parseInt(src.substring(0, idxEnd))];
  else
    return [parseInt(src.substring(0, idxSep)),
            parseInt(src.substring(idxSep+1, idxEnd))];
}
function reset() {
  isWild = inGame = false;
  $('.playingarea').hide();
  $('#players, #hand').empty();
  $('#piles, #pass, #showWC').hide();
  players = {};
  me = callback = undefined;
}
function handleEvent(res) {
  if (res.event === 'playerjoin') {
    addPlayer(res.player);
    status(res.player.name + ' joined the game');
  } else if (res.event === 'playerquit') {
    delete players[res.player.id];
    $('#player-' + res.player.id).remove();
    if (res.newOwner) {
      if (res.newOwner.id === me.id)
        $('#me').addClass('owner');
      else
        $('#player-' + res.newOwner.id).addClass('owner');
    }
  } else if (res.event === 'start') {
    var msg;
    if (res.roundWinner) {
      msg = (res.roundWinner.id === me.id ? 'You' : res.roundWinner.name) +
            ' won this round. Next round started.';
      isNewRound = true;
      isWild = false;
      callback = undefined;
      $('#hand').empty();
      $('#pass, #showWC').hide();
    } else {
      inGame = true;
      msg = 'Game started.';
    }

    $('#discard img').attr('src', cardToImage(res.topCard));

    $('.turn').removeClass('turn');
    if (res.startPlayer.id === me.id) {
      msg += ' Your turn.';
      $('#me').addClass('turn');
    } else
      $('#player-' + res.startPlayer.id).addClass('turn');

    for (var i=0,len=res.hand.length; i<len; ++i)
      $('#hand').append('<img src="' + cardToImage(res.hand[i]) + '" />');
    //$('.cardcount').html('7');
    addCardCount(undefined, 7);

    $('#piles, #hand').show();
    $('.cardcount').css('visibility', 'visible');
    $('#showWC').hide();
    status(msg);
  } else if (res.event === 'play') {
    isNewRound = false;
    var msg = res.player.name + ' played a ' + cardToText(res.card);
    if (typeof res.wildColor !== 'undefined') {
      isWild = true;
      $('#wildColor').attr('class', 'center wildColor' + res.wildColor).show();
    } else if (isWild) {
      isWild = false;
      $('#showWC').hide();
    }
    addCardCount(res.player.id, -1);
    animPlay('#player-' + res.player.id + ' div.cardcount', res.card);
    status(msg);
  } else if (res.event === 'end') {
    status('Game ended' + (res.player ? '. Game winner: ' + res.player.name : ''));
    reset();
  } else if (res.event === 'turn') {
    $('.turn').removeClass('turn');
    if (res.player.id === me.id) {
      status('Your turn');
      $('#me').addClass('turn');
    } else
      $('#player-' + res.player.id).addClass('turn');
  } else if (res.event === 'draw') {
    var who = res.player.name;
    if (res.drawnCards) {
      who = 'You';
      // add card(s) to hand
      var i = 0;
      animDraw('#me', res.drawnCards.length, function() {
        $('#hand').append('<img src="' + cardToImage(res.drawnCards[i++]) + '" />');
      });
    } else {
      animDraw('#player-' + res.player.id + ' div.cardcount', res.numCards, function() {
        addCardCount(res.player.id, 1);
      });
    }
    status(who + ' drew ' + res.numCards + ' card' + (res.numCards > 1 ? 's' : ''));
  } else if (res.event === 'pass') {
    status(res.player.name + ' passed');
  } else if (res.event === 'youknow') {
    status(res.player.name + ' has one card left!');
  } else {
    log('Received unexpected event \'' + res.event + '\': ' + data);
  }
}
function animDraw(where, num, cbEach) {
  if (num <= 0) return;
  var oldPos = $('#draw img').offset(), newPos = $(where).offset(),
      newHeight = 20, newWidth = 13;
  newPos.left += $(where).width()/2;
  $('#draw img').clone(false)
                .css({
                  'z-index': 1000,
                  position: 'absolute',
                  left: oldPos.left,
                  top: oldPos.top,
                  height: 188,
                  width: 122
                })
                .appendTo('body')
                .animate(
                  {
                    left: newPos.left,
                    top: newPos.top,
                    width: newWidth,
                    height: newHeight,
                    opacity: 0
                  }, 500, function() {
                    $(this).remove();
                    if (cbEach)
                      cbEach();
                    animDraw(where, num-1, cbEach);
                  }
                );
}
function animPlay(where, card, cbDone) {
  var oldPos, newPos = $('#discard img').offset(),
      newHeight = 188, newWidth = 122, $el, $handcard,
      src, mine = (typeof where === 'object');
  if (!mine) {
    // other player's card
    oldPos = $(where).offset();
    src = cardToImage(card);
    $el = $('<img src="' + src + '" />').css({
            'z-index': 1000,
            position: 'absolute',
            left: oldPos.left,
            top: oldPos.top,
            height: 20,
            width: 13,
            opacity: 0
          }).appendTo('body');
  } else {
    // our card
    $handcard = $(where);
    oldPos = $handcard.offset();
    $el = $handcard.clone(false).css({
      'z-index': 1000,
      position: 'absolute',
      left: oldPos.left,
      top: oldPos.top,
      width: newWidth,
      height: newHeight,
      opacity: 1
    }).appendTo('body');
    $handcard.css('visibility', 'hidden');
    src = $el.attr('src');
  }
  $el.animate(
    {
      left: newPos.left,
      top: newPos.top,
      width: newWidth,
      height: newHeight,
      opacity: 1
    }, 250, function() {
      $el.remove();
      $('#discard img').attr('src', src);
      if ($handcard)
        $handcard.remove();
      if (cbDone)
        cbDone();
    }
  );
}

/* Utility functions */
function fnEmpty() {}
function entities(str) {
  return encodeURI(str).replace(/%(.{2})/g, function(s, v) {
    return '&#' + parseInt(v, 16);
  });
}
function log(text) {
  $('#log').append(text + '<br />');
}
function status(text) {
  $('#status').html(text);
}
function send(text, cb) {
  callback = cb;
  var ret = conn.send(text);
  if (typeof ret === 'string')
    log('Error while sending data: ' + ret);
  else
    log('Sent: ' + text);
}
function preloadAssets() {
  /* Preload card assets */
  for (var i=0; i<4; ++i)
    for (var j=0; j<13; ++j)
      $('<img/>')[0].src = 'images/' + i + '_' + j + '.png';
  $('<img/>')[0].src = 'images/4.png';
  $('<img/>')[0].src = 'images/5.png';
  $('<img/>')[0].src = imgBack;
}
function initUIHandlers() {
  $('#btnConnect').click(function() { conn.connect(address); });
  $('#btnRegister').click(function() {
    var name;
    if (name = prompt('Enter a nickname to use:')) {
      send('register ' + name, fnEmpty);
    }
  });
  $('#btnCreate').click(function() {
    var gameName = prompt('Enter new game name (blank to autogenerate):');
    if (typeof gameName === 'string') {
      send('create' + (gameName.length > 0 ? ' ' + gameName : ''), function(res) {
        $('.playingarea').show();
        me = res.me;
        $('#me').addClass('owner');
        status('Created game: ' + entities(res.gameName));
      });
    }
  });
  $('#btnStart').click(function() {
    send('start', fnEmpty);
  });
  $('#btnJoin').click(function() {
    var gameName;
    if (gameName = prompt('Join which game?')) {
      send('join ' + gameName, function(res) {
        $('.playingarea').show();
        me = res.me;
        if (res.players)
          for (var i=0,len=res.players.length; i<len; ++i)
            addPlayer(res.players[i]);
        $('#player-' + res.ownerId).addClass('owner');
        status('Joined game: ' + gameName);
      });
    }
  });
  $('#btnLeave').click(function() {
    send('leave', function() {
      reset();
    });
  });
  $('#btnDisconnect').click(function() { conn.disconnect(); });

  $('#draw').click(function() {
    send('draw', function() {
      $('#pass').show();
    });
  });
  $('#pass').click(function() {
    send('pass', function () {
      status('You passed');
      $('#pass').hide();
    });
  });
  $('#colorchooser div').click(function() {
    var color = $(this).index()-1, idxCard = $(elWild).index();
    send('play ' + idxCard + ' ' + color, function() {
      $.modal.close();
      isWild = true;
      if (!isNewRound && inGame)
        status(' ');
      else
        isNewRound = false;
      animPlay(elWild);
      $('#pass').hide();
      $('#wildColor').attr('class', 'center wildColor' + color);
      $('#showWC').show();
    });
  });
  $('#hand img').live('click', function() {
    var idx = $(this).index(), self = this,
        card = imageToCard($(self).attr('src'));
    if (card[0] > 3) {
      elWild = self;
      $('#colorchooser').modal({ overlayClose: true, opacity: 70 });
    } else {
      send('play ' + idx, function() {
        if (!isNewRound && inGame)
          status(' ');
        else
          isNewRound = false;
        animPlay(self);
        $('#pass').hide();
      });
    }
  });
}

/* Setup the connnection */
conn = initTransport(function() {
    log('Connected!');
  },
  function(data) {
    log('Received: ' + data);
    var res;
    try {
      res = JSON.parse(data);
    } catch (e) {
      log('Received malformed JSON (Error: ' + e + '): ' + data);
      return;
    }
    if (res.event)
      handleEvent(res);
    else if (callback) {
      if (res.error)
        alert('Error: ' + res.error);
      else
        callback(res.ret);
      callback = undefined;
    }
    else
      log('Received unexpected response: ' + data);
  }, function() {
    // disconnected cb
    log('Lost connection with the server');
  }, function(msg) {
    // error cb
    log('Unexpected error while communicating with server: ' + msg);
});
if (!conn.connect) {
  $('#ui :input').attr('disabled', 'disabled');
  alert('Sorry, you are using an unsupported browser.');
} else {
  preloadAssets();

  $(function() {
    initUIHandlers();
  });
}