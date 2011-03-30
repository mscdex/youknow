// youknow backend main entry point

var fs = require('fs'), http = require('http'),
    LOG = require('./lib/common').LOG,
    manager = new (require('./lib/manager'))();

var frontends = ['web', 'irc'];

for (var i=0; i<frontends.length; i++) {
  (function(name) {
    frontends[i] = new (require('./lib/frontends/' + name))(manager, function(msg, level) {
      if (level === LOG.ERROR)
        console.error(name.toUpperCase() + ' :: ERROR :: ' + msg);
      else if (level === LOG.DEBUG)
        console.log(name.toUpperCase() + ' :: DEBUG :: ' + msg);
      else if (level === LOG.INFO)
        console.log(name.toUpperCase() + ' :: INFO :: ' + msg);
    });
  )(frontends[i]);
  frontends[i].init();
  console.log('MAIN :: INFO :: Initialized frontend: ' + frontends[i].name);
}

var infoServer = http.createServer(function(req, res) {
  // Echo useful information about games here
  // E.g. game stats, current players, backend uptime, etc?
});
infoServer.listen(8001);