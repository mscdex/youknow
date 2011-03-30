module.exports = {
  LOG: {
    INFO: 1,
    DEBUG: 2,
    ERROR: 4
  },
  CARD_TYPE: {
    BLUE: 0,
    GREEN: 1,
    RED: 2,
    YELLOW: 3,
    WILD: 4,
    WILD4: 5
  },
  CARD_VALUE: {
    DRAW2: 10,
    REVERSE: 11,
    SKIP: 12,
  },
  CARD_POINTS: {}
};

module.exports.CARD_POINTS[module.exports.CARD_VALUE.DRAW2] = 20;
module.exports.CARD_POINTS[module.exports.CARD_VALUE.REVERSE] = 20;
module.exports.CARD_POINTS[module.exports.CARD_VALUE.SKIP] = 20;
module.exports.CARD_POINTS[module.exports.CARD_TYPE.WILD] = 50;
module.exports.CARD_POINTS[module.exports.CARD_TYPE.WILD4] = 50;