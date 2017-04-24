/*!
* socks5-server
* Copyright(c) 2017 Ascari Gutierrez Hermosillo
* MIT Licensed
*/

'use strict';

/*!
* Module dependencies.
*/
const net = require('net');
const dns = require('dns');
const ipv6 = require('ipv6').v6;
const EventEmitter = require('events').EventEmitter;
const { defineProperty } = Object;

/**
* @private
* @const
* @type {Object}
*/
const CMD = {
  CONNECT: 0x01,
  BIND: 0x02,
  UDP: 0x03
};

/**
* @private
* @const
* @type {Object}
*/
const ATYP = {
  IPv4: 0x01,
  NAME: 0x03,
  IPv6: 0x04
};

/**
* @private
* @const
* @type {Object}
*/
const REP = {
  SUCCESS: 0x00,
  GENFAIL: 0x01,
  DISALLOW: 0x02,
  NETUNREACH: 0x03,
  HOSTUNREACH: 0x04,
  CONNREFUSED: 0x05,
  TTLEXPIRED: 0x06,
  CMDUNSUPP: 0x07,
  ATYPUNSUPP: 0x08
};

const BUF_AUTH_NO_ACCEPT = new Buffer([0x05, 0xFF]);
const BUF_REP_INTR_SUCCESS = new Buffer([0x05,
  REP.SUCCESS,
  0x00,
  0x01,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00
]);
const BUF_REP_DISALLOW = new Buffer([0x05, REP.DISALLOW]);
const BUF_REP_CMDUNSUPP = new Buffer([0x05, REP.CMDUNSUPP]);

/**
* @private
* @method ipToBytes
* @param {String} ipAddress
* @return {Array<Number>}
*/
const ipToBytes = (ipAddress) => {
  const type = net.isIP(ipAddress);
  let nums;
  let bytes;
  let i;

  if (type === 4) {
    nums = ipAddress.split('.', 4);
    bytes = new Array(4);
    for (i = 0; i < 4; ++i) {
      if (isNaN(bytes[i] = +nums[i])) {
        throw new Error(`Error parsing IP: ${ ipAddress }`);
      }
    }
  } else if (type === 6) {
    var addr = new ipv6.Address(ipAddress);
    var b = 0;
    var group;

    if (!addr.valid) {
      throw new Error('Error parsing IP: ' + ipAddress);
    }

    nums = addr.parsedAddress;
    bytes = new Array(16);

    for (i = 0; i < 8; ++i, b += 2) {
      group = parseInt(nums[i], 16);
      bytes[b] = group >>> 8;
      bytes[b + 1] = group & 0xFF;
    }
  } else {
    throw new Error('Invalid ipAddress.');
  }
  return bytes;
};

/**
* @private
* @method initNetServer
* @this Socks5Server 
*/
const initNetServer = function() {
  const server = this.__SERVER__.server = new net.Server();
  server.on('connection', (socket) => {
    if (this.connections >= this.maxConnections) {
      socket.destroy();
    } else {
      this.__SERVER__.connections += 1;
      socket.once('close', (had_err) => this.__SERVER__.connections -= 1);
      onConnection.call(this, socket);
    }
  });
  server.on('error', (error) => this.emit('error', error));
  server.on('listening', () => this.emit('listening'));
  server.on('close', () => this.emit('close'));
};

/**
* Handle a SOCKS5 Client socket.
* @private
* @method onConnection
* @param {net.Socket} socket
* @this Socks5Server 
*/
const onConnection = function(socket) {
  let authorized = false;

  socket.on('data', (data) => {
    const version = data[0];

    if (!authorized) {
      const numOfAuthMethods = data[1];
      const authMethodsBuffer = new Buffer(numOfAuthMethods);
      data.copy(authMethodsBuffer, 0, 2);

      /**
      * Loop through authentication methods
      * **NOTE** Only AUTH.NONE is implemented.
      */
      for (var i = 0; i < numOfAuthMethods; i++) {
        const authMethodByte = authMethodsBuffer[i];

        if (authMethodByte === 0) { // NONE
          authorized = true;
          socket.write(
            new Buffer([0x05, authMethodByte])
          );
          return;
        } else {
          socket.end(BUF_AUTH_NO_ACCEPT);
          socket.destroy();
          return;
        }
      }
    } else {
      const command = data[1];
      const reserved = data[2]
      const address_type = data[3];
      const port = data.readUInt16BE(data.length - 2);
      let resolvedAddress = '';

      if (address_type === ATYP.NAME) {
        const addressLength = data[4];
        const addressBuffer = new Buffer(addressLength);
        data.copy(addressBuffer, 0, 4 + 1, data.length - 2);
        resolvedAddress = addressBuffer.toString('ascii');
      } else if (address_type === ATYP.IPv4) {
        throw new Error(`NOT_IMPLEMENTED`);
      } else if (address_type === ATYP.IPv6) {
        throw new Error(`NOT_IMPLEMENTED`);
      } else {
        throw new Error(`Invalid address_type: ${ address_type }`);
      }

      if (command === CMD.CONNECT) {
        cmdConnect.call(this, socket, {
          address: resolvedAddress,
          port,
          version,
        });
      } else {
        return socket.end(BUF_REP_CMDUNSUPP);
      }
    }
  });
};

/**
* @private
* @method cmdConnect
* @param {net.Socket} socket
* @param {Object} req
* @this Socks5Server 
*/
const cmdConnect = function(socket, req) {
  
  /**
  * Remove `data` event handle that was used to read
  * Handshake & Auth. Hereforth, `data` that is read 
  * will be proxied or intercepted.
  */
  socket.listeners('data').forEach(handler => {
    socket.removeListener('data', handler);
  });

  if (this._events.connection) {

    /**
    * socket is added 3 methods
    * 1. deny - Ends Request.
    * 2. accept - Uses client to fetch data for cient, and returns it.
    * 3. intercept - Manually set the client's response.
    *    MUST call: `socket.end();`
    */

    // Deny Connection
    defineProperty(socket, 'deny', {
      value: () => {
        if (socket.writable) {
          socket.end(BUF_REP_DISALLOW);
        }
      }
    });

    // Approve Connection
    defineProperty(socket, 'accept', {
      value: () => {
        if (socket.writable) {
          proxySocket(socket, req);
        }
      }
    });

    // Intercept Connection
    defineProperty(socket, 'intercept', {
      value: () => {
        socket.write(BUF_REP_INTR_SUCCESS);
        process.nextTick(function() {
          socket.resume();
        });
      }
    });

    this.emit('connection', socket, req);
  } else {
    proxySocket(socket, req);
  }
};

/**
* @private
* @method proxySocket
* @param {net.Socket} socket
* @param {Object} req
* @this Socks5Server 
*/
const proxySocket = (socket, req) => {

  dns.lookup(req.address, function(error, dstIp) {
    if (error) {
      return handleProxyError(socket, error);
    }

    let connected = false;

    function onError(error) {
      if (!connected) {
        handleProxyError(socket, error);
      }
    }

    // Socket used to request data for client.
    const destSock = new net.Socket();
    
    destSock.setKeepAlive(false);

    destSock.on('error', onError);

    destSock.on('connect', function() {
      connected = true;
      if (socket.writable) {
        const ipAsArrayOfBytes = ipToBytes(destSock.localAddress);
        const len = ipAsArrayOfBytes.length;
        const replyBuffer = new Buffer(6 + len);
        let p = 4;

        replyBuffer[0] = 0x05;
        replyBuffer[1] = REP.SUCCESS;
        replyBuffer[2] = 0x00;
        replyBuffer[3] = (len === 4 ? ATYP.IPv4 : ATYP.IPv6);

        for (var i = 0; i < len; ++i, ++p) {
          replyBuffer[p] = ipAsArrayOfBytes[i];
        }

        replyBuffer.writeUInt16BE(destSock.localPort, p, true);

        socket.write(replyBuffer);
        socket.pipe(destSock).pipe(socket);
        socket.resume();
      } else if (destSock.writable) {
        destSock.end();
      }
    });

    destSock.connect(req.port, dstIp);
  });
};

/**
* @private
* @method proxySocket
* @param {net.Socket} socket
* @param {Object} req
*/
function handleProxyError(socket, error) {
  if (socket.writable) {
    var errorBuffer = new Buffer([0x05, REP.GENFAIL]);
    if (error.code) {
      switch (error.code) {
        case 'EHOSTUNREACH':
        case 'ENOENT':
        case 'ENOTFOUND':
        case 'ETIMEDOUT':
          errorBuffer[1] = REP.HOSTUNREACH;
        break;
        case 'ENETUNREACH':
          errorBuffer[1] = REP.NETUNREACH;
        break;
        case 'ECONNREFUSED':
          errorBuffer[1] = REP.CONNREFUSED;
        break;
      }
    }
    socket.end(errorBuffer);
  }
}

/**
* SOCKS5 Socks5Server class.
*/
class Socks5Server extends EventEmitter {

  /**
  * Create a Socks5Server.
  * @param {options} [options]
  * @param {Function} [onConnection]
  */
  constructor(options, onConnection) {
    super();
    defineProperty(this, '__SERVER__', {
      value: {
        server: new net.Server(),
      }
    });

    initNetServer.apply(this);
  }

  /**
  * @readonly
  * @type {net.Server}
  */  
  get server() { return this.__SERVER__.server; }

  /**
  * @return
  */
  address() { return this.server.address(); }

  /**
  * @return
  */
  close() { return this.server.close(); }  

  /**
  * @return
  */
  getConnections() { return this.server.getConnections(); }

  /**
  * @return {Socks5Server} Returns `this` instance. **Chainable**.
  */
  listen() {
    this.server.listen(...arguments);
    return this;
  }

  /**
  * @return
  */
  ref() { return this.server.ref(); }

  /**
  * @return
  */
  unref() { return this.server.unref(); }
}

module.exports = Socks5Server;