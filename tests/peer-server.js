// Local PeerJS signalling server for the multiplayer tests, on
// 127.0.0.1:9000 (the game uses it via ?peerhost=127.0.0.1:9000).
// IPv4 on purpose: the default listener can end up IPv6-only.
const http = require('http');

function start(port = 9000) {
  const express = require('express');
  const { ExpressPeerServer } = require('peer');
  const app = express();
  const server = http.createServer(app);
  app.use('/', ExpressPeerServer(server, { path: '/', allow_discovery: false }));
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

module.exports = { start };
if (require.main === module) start().then(() => console.log('peer server on 127.0.0.1:9000'));
