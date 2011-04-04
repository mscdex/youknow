exports.LOG = {
    INFO: 1,
    DEBUG: 2,
    ERROR: 4
};
exports.CARD_TYPE = {
    BLUE: 0,
    GREEN: 1,
    RED: 2,
    YELLOW: 3,
    WILD: 4,
    WILD4: 5
};
exports.CARD_VALUE = {
    DRAW2: 10,
    REVERSE: 11,
    SKIP: 12,
};

exports.CARD_POINTS = {};
exports.CARD_POINTS[exports.CARD_VALUE.DRAW2] = 20;
exports.CARD_POINTS[exports.CARD_VALUE.REVERSE] = 20;
exports.CARD_POINTS[exports.CARD_VALUE.SKIP] = 20;
exports.CARD_POINTS[exports.CARD_TYPE.WILD] = 50;
exports.CARD_POINTS[exports.CARD_TYPE.WILD4] = 50;
// =============================================================================
exports.Player = function(name, game) {
  this.name = name;
  // extra data that can be defined by the underlying GameInterface
  this.userData = undefined;
  this.tsJoin = undefined;
  this.hand = undefined;
  this.game = game;
  this.points = 0;
};
exports.Player.prototype.reset = function() {
  this.hand = undefined;
  this.points = 0;
};
exports.Player.prototype.handleEvent = function() {
  throw new Error('Oops, I\'m not a subclass instance!');
};