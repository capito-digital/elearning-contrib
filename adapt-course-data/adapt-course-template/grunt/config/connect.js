
module.exports = function(grunt, options) {
  const port = parseInt(grunt.option('port')) || 9001;
  const host = grunt.option('host') || 'localhost';

  return {
    server: {
      options: {
        port,
        base: '<%= outputdir %>',
        keepalive: true,
        open: true,
        middleware: function(connect, options, middlewares) {
          middlewares.unshift(function(req, res, next) {
            res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5001');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
            res.setHeader('Access-Control-Allow-Credentials', 'true');

            if (req.method === 'OPTIONS') {
              res.end();
              return;
            }

            next();
          });

          return middlewares;
        }
      }
    },
    'server-silent': {
      options: {
        port,
        base: '<%= outputdir %>',
        keepalive: true,
        open: false
      }
    },
    spoorOffline: {
      options: {
        port,
        base: '<%= outputdir %>',
        keepalive: true,
        open: 'http://' + host + ':' + port + '/scorm_test_harness.html'
      }
    }
  };
};
