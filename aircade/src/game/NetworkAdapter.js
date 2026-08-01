// NetworkAdapter.js
// Simulates a peer-to-peer Bluetooth / Native App network using BroadcastChannel for local cross-tab play.
// In the future, this will be swapped with a Capacitor Bluetooth plugin.

class NetworkAdapter {
  constructor() {
    this.channel = new BroadcastChannel('aircade-ble');
    this.listeners = {};
    this.isHost = false;
    this.myId = Math.random().toString(36).substr(2, 9);
    
    // Host State
    this.roomData = {
      hostName: '',
      players: [],
      gameState: 'lobby'
    };

    this.channel.onmessage = (event) => {
      const { type, senderId, data } = event.data;
      if (senderId === this.myId) return; // Ignore own messages

      // If we are Host, handle incoming client requests
      if (this.isHost) {
        this.handleHostMessage(type, senderId, data);
      } else {
        // We are a Client, handle broadcast updates from Host
        this.handleClientMessage(type, senderId, data);
      }
    };
  }

  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  emitLocal(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(data));
    }
  }

  // Act like socket.emit
  emit(type, data) {
    if (type === 'createRoom') {
      this.isHost = true;
      this.roomData.hostName = data.playerName;
      this.roomData.players = [{ id: this.myId, name: data.playerName, isHost: true }];
      this.emitLocal('roomJoined', { isHost: true, players: this.roomData.players, myId: this.myId });
      return;
    }

    if (type === 'scanLocal') {
      // Broadcast a scan ping. Any Host listening will reply.
      this.channel.postMessage({ type: 'scanPing', senderId: this.myId });
      return;
    }

    if (this.isHost) {
      // Process our own events directly through the host logic
      this.handleHostMessage(type, this.myId, data);
    } else {
      // Clients send events to the host via the channel
      this.channel.postMessage({ type, senderId: this.myId, data });
    }
  }

  handleHostMessage(type, senderId, data) {
    switch (type) {
      case 'scanPing':
        // A client is scanning. Reply with our room info.
        if (this.roomData.gameState === 'lobby') {
          this.channel.postMessage({ type: 'scanReply', senderId: this.myId, data: { hostName: this.roomData.hostName } });
        }
        break;
      case 'joinRoom':
        // A client wants to join.
        if (this.roomData.players.length < 4 && this.roomData.gameState === 'lobby') {
          const newPlayer = { id: senderId, name: data.playerName, isHost: false };
          this.roomData.players.push(newPlayer);
          
          // Tell everyone the new roster
          this.channel.postMessage({ type: 'roomSync', senderId: this.myId, data: this.roomData });
          
          // Tell the specific player they successfully joined
          this.channel.postMessage({ type: 'joinSuccess', senderId: this.myId, data: { targetId: senderId, roomData: this.roomData } });
          
          // Tell local UI a player joined
          this.emitLocal('playerJoined', newPlayer);
        }
        break;
      case 'startGame':
        this.roomData.gameState = 'playing';
        this.channel.postMessage({ type: 'gameStarted', senderId: this.myId });
        this.emitLocal('gameStarted');
        break;
      case 'playerMoved':
        // Re-broadcast client movement to everyone else
        this.channel.postMessage({ type: 'playerMoved', senderId: this.myId, data: { id: senderId, ...data } });
        this.emitLocal('playerMoved', { id: senderId, ...data });
        break;
      case 'resourceGathered':
        this.channel.postMessage({ type: 'resourceGathered', senderId: this.myId, data });
        this.emitLocal('resourceGathered', data);
        break;
      case 'campfireBuilt':
        this.channel.postMessage({ type: 'campfireBuilt', senderId: this.myId, data });
        this.emitLocal('campfireBuilt', data);
        break;
    }
  }

  handleClientMessage(type, senderId, data) {
    switch (type) {
      case 'scanReply':
        this.emitLocal('survivorFound', { hostName: data.hostName });
        break;
      case 'joinSuccess':
        if (data.targetId === this.myId) {
          this.emitLocal('roomJoined', { isHost: false, players: data.roomData.players, myId: this.myId });
        }
        break;
      case 'roomSync':
        this.emitLocal('roomJoined', { isHost: false, players: data.players, myId: this.myId });
        break;
      case 'gameStarted':
        this.emitLocal('gameStarted');
        break;
      case 'playerMoved':
      case 'resourceGathered':
      case 'campfireBuilt':
        this.emitLocal(type, data);
        break;
    }
  }

  disconnect() {
    this.listeners = {};
    // Intentionally not calling this.channel.close()
    // because this is a singleton and React StrictMode 
    // unmounting would permanently close the channel.
  }
}

const networkAdapter = new NetworkAdapter();
export default networkAdapter;
