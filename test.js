/*!
* socks5-server
* Copyright(c) 2017 Ascari Gutierrez Hermosillo
* MIT Licensed
*/

/**
* This module will do the following:
*
* - Any request to `*.google.com` will be denied.
* - Any request to `peqq.es` will be intercepted, with a smiley face.
*   Also, the contents of the request will be sent to stdout.
* - Any other request will be accepted.
*/

const Socks5Server = require('.');

const server = new Socks5Server();

server.on('connection', (socket, socksRequest) => {
  const { address, port } = socksRequest;

  process.stdout.write(`${address}:${port} is `);

  socket.on('error', (error) => {
  	console.log(error);
  });

  if (/\.google\.com/g.exec(address)) {
  	process.stdout.write(`DENIED!\n`);
  	socket.deny();
  } else if (address === 'peqq.es') {
  	process.stdout.write(`INTERCEPTED!\n`);
  	socket.intercept();
  	socket.end('peqq.es ;)');
  	socket.pipe(process.stdout);
  } else {
  	process.stdout.write(`ACCEPTED!\n`);
  	socket.accept();
  }
});

server.listen(1080);