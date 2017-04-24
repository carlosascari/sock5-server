## [socks5-server]()

A SOCKS5 server that allows you to filter connections as well as intercept them.

> This socks5 server is not completed, it only handles `CONNECT` commands and `NONE` as the authorization method.

### Install

```
npm i <this-git-repo> --save
```

### API

## [Socks5Server](/) class extends [EventEmitter](https://nodejs.org/docs/latest/api/events.html#events_class_eventemitter)

### Properties

**server** {[net.Server](https://nodejs.org/docs/latest/api/net.html#net_class_net_server)} **read-only**
Exposes underlying server.

### Methods

**address()** -> {Object}
Returns the bound address, the address family name, and port of the server as reported by the operating system.

**close()**
Stops the server from accepting new connections and keeps existing connections.

**getConnections(*Function*)**
Asynchronously get the number of concurrent connections on the server. Works when sockets were sent to forks.

**listen()**
[Begin accepting connections.](https://nodejs.org/docs/latest/api/net.html#net_server_listen_port_hostname_backlog_callback)

**ref()**
Opposite of unref, calling ref on a previously unrefd server will not let the program exit if it's the only server left.

**unref()**
Calling unref on a server will allow the program to exit if this is the only active server in the event system.

### Events

**close**
Emitted when the server closes.

**connection** *(socket, socksRequest)*
Emitted when a new connection is made.
There are 2 arguments:

1. socket {[net.Socket](https://nodejs.org/docs/latest/api/net.html#net_class_net_socket)}
2. socksRequest {Object} with the following properties:
	- *address* {String} Target address, can be hostname, or ip address (ip4 & ip6).
	- *port* - {Number} Target port adress.

**error** *(error)*
Emitted when an error occurs.

**listening**
Emitted when the server has been bound after calling `.listen()`.

## [Socket](/) instance

The socket exposed as the first argument in the `connection` event is a {[net.Socket](https://nodejs.org/docs/latest/api/net.html#net_class_net_socket)} with 3 added methods:

socket.**deny**()
Ends client connection. 
*The `socket` should not be written to.*

socket.**accept**()
Proxies client request, that is the server creates a connection to the target adress and returns the response back to the client.
*The `socket` should not be written to.*

socket.**intercept**()
Allows you to write to the client socket.
*You have to call `socket.end()`, to end the connection.*

**NOTE**: You should only call one of the 3 methods.

## EXAMPLE

*This example will do the following:*

- Any request to `*.google.com` will be denied.
- Any request to `peqq.es` will be intercepted, with a smiley face.
  Also, the contents of the request will be sent to stdout.
- Any other request will be accepted.

```
const Socks5Server = require('socks5-server');

const server = new Socks5Server();

server.on('connection', (socket, socksRequest) => {
  const { address, port } = socksRequest;

  process.stdout.write(`${address}:${port} is `);

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

  // Handle errors, or they will throw.
  socket.on('error', (error) => {
  	console.log(error);
  });
});

server.listen(1080);
```

**A file named *test.js* can be found in this repository with the example: `node test.js`**

## Freebie

If you are on linux and using Gnome, such as Ubunto or Mint.
You can set your proxy configuration with this:

**Set socks5 server address**
`gsettings set org.gnome.system.proxy.socks host '127.0.0.1'`

**Set socks5 server port**
`gsettings set org.gnome.system.proxy.socks port 1080`

**Enable proxy**
`gsettings set org.gnome.system.proxy mode 'manual'`

And to remove it:

**Disable proxy**
`gsettings set org.gnome.system.proxy mode 'none'`

When enabled, your web browser should auto detect the configuration and forward all requests through the socks5 server. Make sure the server is up, otherwise you will not be able to browse the web ;).

### License

MIT