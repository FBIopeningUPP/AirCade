import { useRef, useState, useEffect, useCallback } from 'react';
import PhaserGame from './game/PhaserGame';
import MobileControls from './components/MobileControls';
import { multiplayerManager } from './multiplayer/MultiplayerManager';
import { BLE } from './shared/constants/BleConstants';
import './index.css';

export default function App() {
  const gameRef = useRef(null);
  const [gameState, setGameState] = useState('menu');
  const [inventory, setInventory] = useState({ Wood: 0, Stone: 0, Radio: 0 });
  const [health, setHealth] = useState(100);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [playerCount, setPlayerCount] = useState(0);
  const [_playerId, _setPlayerId] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [error, setError] = useState(null);
  const isTouch = navigator.maxTouchPoints > 0;
  const isMobile = window.innerWidth < 768;
  const inputRef = useRef({
    flags: 0,
    joy_x: 0,
    joy_y: 0,
    target_id: 0,
    target_type: 0,
  });

  useEffect(() => {
    multiplayerManager.setCallbacks({
      onStateUpdate: handleStateUpdate,
      onEvent: handleEvent,
      onConnectionChange: handleConnectionChange,
      onError: handleError,
    });
    return () => {
      multiplayerManager.disconnect();
    };
  }, []);

  const handleConnectionChange = useCallback((status) => {
    setConnectionStatus(status);
    if (status === 'connected') {
      setGameState('playing');
      setError(null);
    } else if (status === 'disconnected' && gameState === 'playing') {
      setGameState('menu');
    }
  }, [gameState]);

  const handleError = useCallback((err) => {
    setError(err.message);
    console.error('[App] Multiplayer error:', err);
  }, []);

const handleStateUpdate = useCallback((msg) => {
    if (!gameRef.current) return;
    const scene = gameRef.current.scene.getScene('GameScene');
    if (scene && scene.applySnapshot) {
      scene.applySnapshot(msg);
    }
    if (msg.type === 'SNAPSHOT') {
      setPlayerCount(msg.player_count);
      if (msg.local_player_id !== undefined) {
        scene.setHostMode(false, msg.local_player_id);
      }
    }
    if (msg.type === 'JOIN_ACCEPT') {
      scene.setHostMode(false, msg.player_id);
    }
  }, []);

  const handleStartSolo = useCallback(() => {
    setGameState('playing');
    if (gameRef.current) {
      const scene = gameRef.current.scene.getScene('GameScene');
      if (scene && scene.setHostMode) {
        scene.setHostMode(true, multiplayerManager.transport.peer_id);
      }
    }
  }, []);

  const handleEvent = useCallback((msg) => {
    if (!gameRef.current) return;
    const scene = gameRef.current.scene.getScene('GameScene');
    if (scene && scene.handleEvent) {
      scene.handleEvent(msg);
    }
    switch (msg.evt_type) {
      case BLE.EVENT_TYPES.GATHER:
        const itemName = msg.item_id === BLE.ITEM_IDS.WOOD ? 'Wood' :
                         msg.item_id === BLE.ITEM_IDS.STONE ? 'Stone' : 'Radio';
        setInventory(prev => ({ ...prev, [itemName]: prev[itemName] + 1 }));
        break;
      case BLE.EVENT_TYPES.CRAFT:
        break;
      case BLE.EVENT_TYPES.DAMAGE:
        setHealth(msg.new_health);
        break;
      case BLE.EVENT_TYPES.WIN:
        setGameState('win');
        break;
      case BLE.EVENT_TYPES.PLAYER_JOINED:
        setPlayerCount(prev => prev + 1);
        break;
      case BLE.EVENT_TYPES.PLAYER_LEFT:
        setPlayerCount(prev => Math.max(0, prev - 1));
        break;
    }
  }, []);

  const handleHost = useCallback(async () => {
    setGameState('hosting');
    setError(null);
    try {
      await multiplayerManager.host();
      setIsHost(true);
    } catch (err) {
      setError(err.message);
      setGameState('menu');
    }
  }, []);

  const handleScan = useCallback(async () => {
    setGameState('scanning');
    setError(null);
    try {
      const result = await multiplayerManager.scan();
      setScanResult(result);
      setGameState('found_survivor');
    } catch (err) {
      setError(err.message);
      setGameState('menu');
    }
  }, []);

  const handleConnect = useCallback(async () => {
    if (!scanResult) return;
    setGameState('connecting');
    setError(null);
    try {
      await multiplayerManager.connect(scanResult.device_id);
      setIsHost(false);
    } catch (err) {
      setError(err.message);
      setGameState('menu');
    }
  }, [scanResult]);

  useEffect(() => {
    if (gameState !== 'playing') return;

    const handleGather = (item) => {
      setInventory(prev => ({ ...prev, [item]: prev[item] + 1 }));
    };
    
    const handleDamage = () => {
      setHealth(h => {
        if (h - 5 <= 0) {
          setGameState('gameover');
        }
        return Math.max(0, h - 5);
      });
    };

    const checkGame = setInterval(() => {
      if (gameRef.current) {
        gameRef.current.events.on('itemGathered', handleGather);
        gameRef.current.events.on('takeDamage', handleDamage);
        clearInterval(checkGame);
      }
    }, 100);

    return () => {
      clearInterval(checkGame);
      if (gameRef.current) {
        gameRef.current.events.off('itemGathered', handleGather);
        gameRef.current.events.off('takeDamage', handleDamage);
      }
    };
  }, [gameState]);

  useEffect(() => {
    if (inventory.Radio >= 3) {
      setGameState('win');
    }
  }, [inventory.Radio]);

  const handleJoystickMove = useCallback((e) => {
    inputRef.current.joy_x = Math.round(e.x * 1000);
    inputRef.current.joy_y = Math.round(-e.y * 1000);
    if (gameRef.current) gameRef.current.events.emit('joystickMove', { x: e.x, y: -e.y });
  }, []);

  const handleJoystickStop = useCallback(() => {
    inputRef.current.joy_x = 0;
    inputRef.current.joy_y = 0;
    if (gameRef.current) gameRef.current.events.emit('joystickStop');
  }, []);

  const handleChop = useCallback(() => {
    inputRef.current.flags |= BLE.INPUT_FLAGS.CHOP;
    if (gameRef.current) gameRef.current.events.emit('chopAction');
    setTimeout(() => {
      inputRef.current.flags &= ~BLE.INPUT_FLAGS.CHOP;
    }, 100);
  }, []);

  const handleCraftCampfire = useCallback(() => {
    if (inventory.Wood >= 2 && inventory.Stone >= 1) {
      inputRef.current.flags |= BLE.INPUT_FLAGS.CRAFT;
      setInventory(prev => ({
        ...prev,
        Wood: prev.Wood - 2,
        Stone: prev.Stone - 1
      }));
      if (gameRef.current) {
        gameRef.current.events.emit('craftCampfire');
      }
      setTimeout(() => {
        inputRef.current.flags &= ~BLE.INPUT_FLAGS.CRAFT;
      }, 100);
    }
  }, [inventory.Wood, inventory.Stone]);

  useEffect(() => {
    if (gameState !== 'playing') return;
    const interval = setInterval(() => {
      multiplayerManager.queueInput({ ...inputRef.current });
    }, 50);
    return () => clearInterval(interval);
  }, [gameState]);

  if (gameState === 'menu') {
    return (
      <div style={{ width: '100vw', height: '100vh', backgroundImage: 'url(/menu_bg.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', zIndex: 1 }}></div>
        <div style={{ zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
          <h1 style={{ fontSize: '4rem', marginBottom: '1rem', textAlign: 'center', color: 'white', textShadow: '0 0 20px rgba(0,0,0,0.8)' }}>AIRCADE: SURVIVAL</h1>
          <button 
            className="retro-button"
            onClick={handleHost}
            style={{ fontSize: '24px', background: '#2ecc71', color: 'white', width: '400px' }}
          >
            BROADCAST (HOST)
          </button>
          <button 
            className="retro-button"
            onClick={handleScan}
            style={{ fontSize: '24px', background: '#3498db', color: 'white', width: '400px' }}
          >
            SCAN (JOIN)
          </button>
        </div>
      </div>
    );
  }

  if (gameState === 'hosting') {
    return (
      <div style={{ width: '100vw', height: '100vh', backgroundImage: 'url(/menu_bg.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', zIndex: 1 }}></div>
        <div className="retro-box" style={{ zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', padding: '40px' }}>
          <h2 style={{ fontSize: '2rem', textAlign: 'center', margin: 0 }}>BROADCASTING BLE SIGNAL...</h2>
          <div style={{ width: '100px', height: '100px', borderRadius: '50%', background: '#3498db', animation: 'circlePulse 1.5s infinite' }}></div>
          <div style={{ color: 'white', fontSize: '16px', marginTop: '10px' }}>
            Waiting for players... ({playerCount} connected)
          </div>
          <button 
            className="retro-button"
            onClick={handleStartSolo}
            style={{ fontSize: '24px', background: '#e67e22', color: 'white', marginTop: '20px' }}
            disabled={playerCount === 0}
          >
            START GAME
          </button>
        </div>
        <style>{`
          @keyframes circlePulse {
            0% { transform: scale(0.8); opacity: 0.5; }
            50% { transform: scale(1.2); opacity: 1; }
            100% { transform: scale(0.8); opacity: 0.5; }
          }
        `}</style>
      </div>
    );
  }

  if (gameState === 'scanning') {
    return (
      <div style={{ width: '100vw', height: '100vh', backgroundImage: 'url(/menu_bg.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', zIndex: 1 }}></div>
        <div className="retro-box" style={{ zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', padding: '40px' }}>
          <h2 style={{ fontSize: '2rem', textAlign: 'center', margin: 0 }}>SCANNING LOCAL AREA...</h2>
          <div style={{ width: '100px', height: '100px', borderRadius: '50%', background: '#e74c3c', animation: 'circlePulse 1.5s infinite' }}></div>
        </div>
        <style>{`
          @keyframes circlePulse {
            0% { transform: scale(0.8); opacity: 0.5; }
            50% { transform: scale(1.2); opacity: 1; }
            100% { transform: scale(0.8); opacity: 0.5; }
          }
        `}</style>
      </div>
    );
  }

  if (gameState === 'found_survivor') {
    return (
      <div style={{ width: '100vw', height: '100vh', backgroundImage: 'url(/menu_bg.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', zIndex: 1 }}></div>
        <div className="retro-box" style={{ zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', padding: '40px' }}>
          <h2 style={{ fontSize: '2rem', textAlign: 'center', margin: 0 }}>SURVIVOR FOUND: {scanResult?.name || 'PLAYER 1'}</h2>
          <div style={{ color: '#aaa', fontSize: '14px' }}>Signal: {scanResult?.rssi} dBm</div>
          <button 
            className="retro-button"
            onClick={handleConnect}
            style={{ fontSize: '24px', background: '#2ecc71', color: 'white', marginTop: '20px' }}
          >
            CONNECT VIA BLUETOOTH
          </button>
        </div>
      </div>
    );
  }

  if (gameState === 'connecting') {
    return (
      <div style={{ width: '100vw', height: '100vh', backgroundImage: 'url(/menu_bg.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', zIndex: 1 }}></div>
        <div className="retro-box" style={{ zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', padding: '40px' }}>
          <h2 style={{ fontSize: '2rem', textAlign: 'center', margin: 0 }}>CONNECTING...</h2>
          <div style={{ width: '100px', height: '100px', borderRadius: '50%', background: '#f39c12', animation: 'circlePulse 1.5s infinite' }}></div>
        </div>
        <style>{`
          @keyframes circlePulse {
            0% { transform: scale(0.8); opacity: 0.5; }
            50% { transform: scale(1.2); opacity: 1; }
            100% { transform: scale(0.8); opacity: 0.5; }
          }
        `}</style>
      </div>
    );
  }

  if (gameState === 'gameover') {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: '#ff0000', color: '#fff' }}>
        <h1 style={{ fontSize: '4rem', marginBottom: '2rem', textAlign: 'center' }}>YOU FROZE TO DEATH</h1>
        <button 
          className="retro-button"
          onClick={() => {
            setHealth(100);
            setInventory({ Wood: 0, Stone: 0, Radio: 0 });
            setGameState('playing');
          }}
          style={{ fontSize: '24px', background: '#000', color: '#fff', border: '4px solid #fff' }}
        >
          TRY AGAIN
        </button>
      </div>
    );
  }

  if (gameState === 'win') {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: '#3498db', color: '#fff' }}>
        <h1 style={{ fontSize: '4rem', marginBottom: '2rem', textAlign: 'center' }}>RESCUE HAS ARRIVED!</h1>
        <img src="/helicopter.png" alt="Helicopter" style={{ marginBottom: '2rem' }} />
        <button 
          className="retro-button"
          onClick={() => {
            setHealth(100);
            setInventory({ Wood: 0, Stone: 0, Radio: 0 });
            setGameState('playing');
          }}
          style={{ fontSize: '24px', background: '#2ecc71', color: '#fff', border: '4px solid #fff' }}
        >
          PLAY AGAIN
        </button>
      </div>
    );
  }

  const canCraft = inventory.Wood >= 2 && inventory.Stone >= 1;

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {error && (
        <div style={{ position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)', zIndex: 100, background: '#e74c3c', color: 'white', padding: '10px 20px', borderRadius: '5px', fontSize: '14px' }}>
          {error}
        </div>
      )}
      {/* HUD Overlay */}
      <div className="retro-box" style={{ position: 'absolute', top: isMobile ? '5px' : '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 20, display: 'flex', gap: isMobile ? '10px' : '20px', fontSize: isMobile ? '14px' : '20px' }}>
        <span key={health} className={health < 100 ? "health-flash" : ""} style={{ display: 'inline-block' }}>
          <img src="/icon_heart.png" style={{ width: '24px', height: '24px', verticalAlign: 'middle', marginRight: '8px' }} alt="Health" />
          {health}
        </span>
        <span>
          <img src="/icon_wood.png" style={{ width: '24px', height: '24px', verticalAlign: 'middle', marginRight: '8px' }} alt="Wood" />
          {inventory.Wood}
        </span>
        <span>
          <img src="/icon_stone.png" style={{ width: '24px', height: '24px', verticalAlign: 'middle', marginRight: '8px' }} alt="Stone" />
          {inventory.Stone}
        </span>
        <span>
          📻 {inventory.Radio}/3
        </span>
        <span style={{ color: connectionStatus === 'connected' ? '#2ecc71' : '#e74c3c' }}>
          {connectionStatus.toUpperCase()}
        </span>
        <span style={{ color: '#3498db' }}>
          PLAYERS: {playerCount}
        </span>
        {isHost && <span style={{ color: '#f39c12' }}>HOST</span>}
      </div>
      
      <PhaserGame gameRef={gameRef} />
      
      {isTouch && <MobileControls onMove={handleJoystickMove} onStop={handleJoystickStop} onChop={handleChop} />}
      {!isTouch && (
        <button 
          className="retro-button"
          onClick={handleChop}
          style={{ position: 'absolute', bottom: 50, right: 50, zIndex: 10, fontSize: '20px', background: '#000', border: '4px solid #fff' }}
        >
          GATHER (SPACE)
        </button>
      )}
      
      {canCraft && (
        <button 
          className="retro-button"
          onClick={handleCraftCampfire}
          style={{ position: 'absolute', top: isMobile ? '60px' : '100px', right: '10px', zIndex: 10, fontSize: isMobile ? '14px' : '18px', background: '#e67e22' }}
        >
          🔥 CRAFT CAMPFIRE<br/>
          (2 <img src="/icon_wood.png" style={{ width: '16px', height: '16px', verticalAlign: 'middle' }} alt="Wood" />, 
           1 <img src="/icon_stone.png" style={{ width: '16px', height: '16px', verticalAlign: 'middle' }} alt="Stone" />)
        </button>
      )}
    </div>
  );
}
