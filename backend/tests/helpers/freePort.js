/* An OS-assigned free port for a spawned test server.
 *
 * Every integration suite boots its OWN copy of `src/server.js`. They used to
 * hardcode their ports (5297, 5298, 5299, 5399) — which is fine right up until
 * two suites drift onto the SAME number. Then `npm test` fails in a way that
 * looks nothing like a port clash: the second server cannot bind, so that
 * suite's requests land on the OTHER suite's server and its database, and
 * dozens of unrelated assertions fail. It even passes on a re-run once jest
 * happens to schedule the two files apart.
 *
 * Asking the OS for a port removes the whole class of failure. Suites get
 * distinct ports by construction, so adding a new integration test can never
 * collide with an existing one.
 */
const net = require('net');

module.exports = function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
};
