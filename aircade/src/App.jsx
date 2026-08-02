import { useRef, useState, useEffect } from 'react';
import PhaserGame from './game/PhaserGame';
import MobileControls from './components/MobileControls';
import './index.css';
import { multiplayerManager } from './multiplayer/MultiplayerManager';
import { Capacitor } from '@capacitor/core';

let audioCtx = null;

const initAudio = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
};

const playBlip = () => {
  try {
    initAudio();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(400, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.05);
    
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.1, audioCtx.currentTime + 0.01);
    gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.05);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.05);
  } catch (e) {
    console.error(e);
  }
};

const playSelect = () => {
  try {
    initAudio();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.1);
    
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 0.02);
    gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.1);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
  } catch (e) {
    console.error(e);
  }
};

export default function App() {
  const gameRef = useRef(null);
  const [gameState, setGameState] = useState('menu');
  const [hudState, setHudState] = useState({ health: 100, inventory: { Wood: 0, Stone: 0, Radio: 0 } });
  const [isShivering, setIsShivering] = useState(false);
  const [tutorialState, setTutorialState] = useState('visible');
  const [day, setDay] = useState(1);
  const [dayFlash, setDayFlash] = useState(false);
  const [isMobile, setIsMobile] = useState(Capacitor.isNativePlatform());
  const [typedTutorial, setTypedTutorial] = useState('');
  
  const [socket, setSocket] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [roomData, setRoomData] = useState({ roomCode: '', players: [], isHost: false, myId: '' });
  const [foundRoom, setFoundRoom] = useState({ hostName: '', deviceId: null });
  const [isConnecting, setIsConnecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [fadeState, setFadeState] = useState('fade-in');
  const [pendingState, setPendingState] = useState(null);
  const tutorialLines = "WASD to move | SPACE to gather\n\nBuild campfires to survive the night\n\nFind 3 Radio Parts to escape";

  const changeGameState = (newState) => {
    setFadeState('fade-out');
    setPendingState(newState);
  };

  useEffect(() => {
    if (fadeState === 'fade-out' && pendingState) {
      const timer = setTimeout(() => {
        setGameState(pendingState);
        setPendingState(null);
        setFadeState('fade-in');
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [fadeState, pendingState]);

  const gameStateRef = useRef(gameState);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    let errorTimer = null;
    let disconnectTimer = null;
    
    multiplayerManager.setCallbacks({
      onStateUpdate: (snap) => {
        if (gameRef.current) {
          gameRef.current.events.emit('stateUpdate', snap);
        }
      },
      onEvent: (evt) => {
        if (gameRef.current) {
          gameRef.current.events.emit('networkEvent', evt);
        }
      },
      onConnectionChange: (state) => {
        if (state === 'connected') {
          // Immediately enter playing state when fully connected via BLE for clients
          if (!multiplayerManager.isHost) {
            changeGameState('playing');
          }
        } else if (state === 'disconnected') {
          setErrorMsg('Disconnected');
          changeGameState('menu');
          if (disconnectTimer) clearTimeout(disconnectTimer);
          disconnectTimer = setTimeout(() => setErrorMsg(''), 3000);
        }
      },
      onError: (err) => {
        setErrorMsg(err.message || 'Network error');
        if (gameStateRef.current === 'scanning') changeGameState('menu');
        if (errorTimer) clearTimeout(errorTimer);
        errorTimer = setTimeout(() => setErrorMsg(''), 8000);
      }
    });

    let index = 0;
    const interval = setInterval(() => {
      if (index <= tutorialLines.length) {
        setTypedTutorial(tutorialLines.slice(0, index));
        index++;
      } else {
        clearInterval(interval);
      }
    }, 50);
    
    return () => {
      clearInterval(interval);
      if (errorTimer) clearTimeout(errorTimer);
      if (disconnectTimer) clearTimeout(disconnectTimer);
      multiplayerManager.setCallbacks({ onStateUpdate: null, onEvent: null, onConnectionChange: null, onError: null });
      multiplayerManager.disconnect();
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768 || 'ontouchstart' in window);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (gameState === 'playing' && tutorialState === 'visible') {
      const fadeTimer = setTimeout(() => {
        setTutorialState('fading');
      }, 5000);
      const hideTimer = setTimeout(() => {
        setTutorialState('hidden');
      }, 6000);
      return () => { clearTimeout(fadeTimer); clearTimeout(hideTimer); };
    }
  }, [gameState, tutorialState]);

  useEffect(() => {
    if (gameState !== 'playing') return;

    let shiverTimer = null;
    let dayFlashTimer = null;

    const handleUpdateHUD = (data) => {
      setHudState(prev => {
        if (data.health < prev.health) {
          setIsShivering(true);
          if (shiverTimer) clearTimeout(shiverTimer);
          shiverTimer = setTimeout(() => setIsShivering(false), 500);
        }
        return data;
      });
    };

    const handleGameOver = () => {
      setGameState('gameover');
    };

    const handleGameWon = () => {
      setGameState('win');
    };

    const handleNewDay = (newDayCount) => {
      setDay(newDayCount);
      setDayFlash(true);
      if (dayFlashTimer) clearTimeout(dayFlashTimer);
      dayFlashTimer = setTimeout(() => setDayFlash(false), 2000);
    };

    let gameInstance = null;

    const checkGame = setInterval(() => {
      if (gameRef.current) {
        gameInstance = gameRef.current;
        gameInstance.events.on('updateHUD', handleUpdateHUD);
        gameInstance.events.on('gameOver', handleGameOver);
        gameInstance.events.on('gameWon', handleGameWon);
        gameInstance.events.on('newDay', handleNewDay);
        clearInterval(checkGame);
      }
    }, 100);

    return () => {
      clearInterval(checkGame);
      if (shiverTimer) clearTimeout(shiverTimer);
      if (dayFlashTimer) clearTimeout(dayFlashTimer);
      // Clean up using current gameRef just in case gameInstance is stale
      const gameToClean = gameInstance || gameRef.current;
      if (gameToClean) {
        gameToClean.events.off('updateHUD', handleUpdateHUD);
        gameToClean.events.off('gameOver', handleGameOver);
        gameToClean.events.off('gameWon', handleGameWon);
        gameToClean.events.off('newDay', handleNewDay);
      }
    };
  }, [gameState]);

  const handleJoystickMove = (e) => {
    if (gameRef.current) gameRef.current.events.emit('joystickMove', { x: e.x, y: -e.y });
  };

  const handleJoystickStop = () => {
    if (gameRef.current) gameRef.current.events.emit('joystickStop');
  };

  const handleChop = () => {
    if (gameRef.current) gameRef.current.events.emit('chopAction');
  };

  const handleCraftCampfire = () => {
    if (gameRef.current) {
      gameRef.current.events.emit('requestCraft');
    }
  };

  const handleCreateRoom = async () => {
    if (playerName.trim()) {
      try {
        await multiplayerManager.host();
        setRoomData({ players: [{ id: 'host', name: playerName.trim(), isHost: true }], isHost: true, myId: 'host' });
        changeGameState('lobby');
      } catch (e) {
        setErrorMsg(e.message);
      }
    } else {
      setErrorMsg('Please enter a name first');
    }
  };

  const handleScanLocal = async () => {
    if (playerName.trim()) {
      changeGameState('scanning');
      try {
        const device = await multiplayerManager.scan();
        if (device) {
          setFoundRoom({ hostName: device.name, deviceId: device.device_id || device.deviceId });
          changeGameState('found_survivor');
        } else {
          setErrorMsg('No survivor found');
          changeGameState('menu');
        }
      } catch (e) {
        if (e.message !== 'Scan cancelled') {
          setErrorMsg(e.message || 'Scan failed');
          changeGameState('menu');
        }
      }
    } else {
      setErrorMsg('Please enter a name first');
    }
  };

  const handleJoinRoom = async () => {
    if (foundRoom.deviceId) {
      try {
        setIsConnecting(true);
        await multiplayerManager.connect(foundRoom.deviceId);
        setIsConnecting(false);
      } catch (e) {
        setIsConnecting(false);
        setErrorMsg(e.message);
        changeGameState('menu');
      }
    }
  };

  const handleStartGame = () => {
    if (roomData.isHost) {
      changeGameState('playing');
      // For testing cross-tab, the host just transitions to playing.
      // The client will transition on 'connected'
    }
  };

  if (gameState === 'menu') {
    return (
      <div className={`fade-wrapper ${fadeState}`}>
        <div className="pan-bg" style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.3)', zIndex: 1 }}></div>
          <div style={{ zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '30px' }}>
            <h1 className="glitch-title" data-text="AIRCADE: SURVIVAL" style={{ marginBottom: '10px' }}>AIRCADE: SURVIVAL</h1>
            
            {errorMsg && (
              <div style={{ 
                color: '#fff', 
                background: '#d32f2f', 
                padding: '20px', 
                borderRadius: '8px',
                border: '4px solid #fff', 
                fontSize: '24px', 
                fontWeight: 'bold',
                boxShadow: '0 0 20px rgba(255,0,0,0.8)',
                maxWidth: '90%',
                wordWrap: 'break-word',
                textAlign: 'center',
                zIndex: 999
              }}>
                ERROR: {errorMsg}
              </div>
            )}
            
            <div className="retro-box" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', padding: '40px', minWidth: '500px' }}>
              <input 
                type="text" 
                className="retro-input"
                placeholder="ENTER PLAYER NAME" 
                maxLength={12}
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value.toUpperCase())}
                style={{ width: '100%', boxSizing: 'border-box', marginBottom: '10px' }}
              />

              <div style={{ display: 'flex', gap: '20px', width: '100%' }}>
                <button 
                  className="chunky-button host-btn"
                  onMouseEnter={playBlip}
                  onClick={() => { playSelect(); handleCreateRoom(); }}
                  style={{ flex: 1, padding: '20px 0' }}
                >
                  HOST
                </button>
                <button 
                  className="chunky-button join-btn"
                  onMouseEnter={playBlip}
                  onClick={() => { playSelect(); handleScanLocal(); }}
                  style={{ flex: 1, padding: '20px 0' }}
                >
                  JOIN
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'scanning') {
    return (
      <div className={`fade-wrapper ${fadeState}`}>
        <div className="pan-bg" style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.3)', zIndex: 1 }}></div>
          <div className="retro-box" style={{ zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', padding: '40px' }}>
            <h2 style={{ fontSize: '2rem', textAlign: 'center', margin: 0, color: 'var(--color-red)' }}>SCANNING LOCAL AREA...</h2>
            <div style={{ width: '100px', height: '100px', borderRadius: '50%', background: 'var(--color-red)', animation: 'circlePulse 1.5s infinite', boxShadow: '0 0 20px var(--color-red)' }}></div>
            <button 
              className="retro-button"
              onMouseEnter={playBlip}
              onClick={() => { playSelect(); multiplayerManager.disconnect(); changeGameState('menu'); }}
              style={{ fontSize: '20px', marginTop: '20px' }}
            >
              CANCEL
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
      </div>
    );
  }

  if (gameState === 'found_survivor') {
    return (
      <div className={`fade-wrapper ${fadeState}`}>
        <div className="pan-bg" style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.3)', zIndex: 1 }}></div>
          <div className="retro-box" style={{ zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', padding: '40px' }}>
            <h2 style={{ fontSize: '2rem', textAlign: 'center', margin: 0, color: 'var(--color-text)' }}>SURVIVOR FOUND:<br/><span style={{color: 'var(--color-green)'}}>{foundRoom.hostName}</span></h2>
            <button 
              className="chunky-button join-btn"
              onMouseEnter={playBlip}
              onClick={() => { playSelect(); handleJoinRoom(); }}
              style={{ marginTop: '20px' }}
              disabled={isConnecting}
            >
              {isConnecting ? 'CONNECTING...' : 'CONNECT VIA BLUETOOTH'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'lobby') {
    return (
      <div className={`fade-wrapper ${fadeState}`}>
        <div className="pan-bg" style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.3)', zIndex: 1 }}></div>
          <div className="retro-box" style={{ zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', padding: '40px', minWidth: '400px' }}>
            
            <h2 style={{ fontSize: '2rem', textAlign: 'center', margin: 0, color: roomData.isHost ? 'var(--color-amber)' : 'var(--color-green)' }}>
              {roomData.isHost ? 'BROADCASTING BLE SIGNAL...' : 'CONNECTED TO BLE SIGNAL'}
            </h2>
            {roomData.isHost && (
              <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'var(--color-amber)', animation: 'circlePulse 1.5s infinite', boxShadow: '0 0 20px var(--color-amber)' }}></div>
            )}
            
            <div style={{ width: '100%', borderTop: '4px solid var(--color-border)', margin: '10px 0' }}></div>
            <h3 style={{ fontSize: '1.5rem', color: '#555', margin: 0 }}>SURVIVORS CONNECTED</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', width: '100%' }}>
              {roomData.players.map((p, i) => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '24px', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '10px', borderLeft: p.isHost ? '4px solid var(--color-amber)' : '4px solid var(--color-green)' }}>
                  <span>P{i+1}: {p.name} {p.id === roomData.myId ? '(YOU)' : ''}</span>
                  <span style={{ color: p.isHost ? 'var(--color-amber)' : 'var(--color-green)', fontSize: '16px', animation: 'blink 2s infinite' }}>[READY]</span>
                </div>
              ))}
              {[...Array(4 - roomData.players.length)].map((_, i) => (
                <div key={`empty-${i}`} style={{ fontSize: '24px', color: '#333', padding: '10px' }}>[NO SIGNAL]</div>
              ))}
            </div>

            <div style={{ width: '100%', borderTop: '4px solid var(--color-border)', margin: '10px 0' }}></div>

            {roomData.isHost ? (
              <button 
                className="chunky-button host-btn"
                onMouseEnter={playBlip}
                onClick={() => { playSelect(); handleStartGame(); }}
                style={{ width: '100%', marginTop: '10px' }}
              >
                START GAME
              </button>
            ) : (
              <div style={{ fontSize: '20px', color: '#555', marginTop: '20px', animation: 'blink 1.5s infinite' }}>WAITING FOR HOST TO START...</div>
            )}
          </div>
          <style>{`
            @keyframes circlePulse {
              0% { transform: scale(0.8); opacity: 0.5; }
              50% { transform: scale(1.2); opacity: 1; }
              100% { transform: scale(0.8); opacity: 0.5; }
            }
            @keyframes blink {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.3; }
            }
          `}</style>
        </div>
      </div>
    );
  }

  if (gameState === 'gameover') {
    return (
      <div className={`fade-wrapper ${fadeState}`} style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: '#ff0000', color: '#fff' }}>
        <h1 style={{ fontSize: '4rem', marginBottom: '2rem', textAlign: 'center' }}>YOU FROZE TO DEATH</h1>
        <button 
          className="retro-button"
          onMouseEnter={playBlip}
          onClick={() => {
            playSelect();
            if (gameRef.current) gameRef.current.events?.emit('restartGame');
            setDay(1);
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
            if (gameRef.current) gameRef.current.events.emit('restartGame');
            setDay(1);
            setGameState('playing');
          }}
          style={{ fontSize: '24px', background: '#2ecc71', color: '#fff', border: '4px solid #fff' }}
        >
          PLAY AGAIN
        </button>
      </div>
    );
  }

  const { health, inventory } = hudState;
  const canCraft = inventory.Wood >= 2 && inventory.Stone >= 1;

  return (
    <div className={`fade-wrapper ${fadeState}`} style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <div className="crt-overlay"></div>
      <div className="crt-vignette"></div>
      {/* Split HUD - Left */}
      <div className={isShivering ? 'shiver' : ''} style={{ position: 'absolute', top: isMobile ? 10 : 20, left: isMobile ? 10 : 20, display: 'flex', flexDirection: 'column', gap: isMobile ? '5px' : '10px', zIndex: 20 }}>
        <div className={`retro-box ${dayFlash ? 'day-flash' : ''}`} style={{ padding: isMobile ? '5px 10px' : '10px 20px', fontSize: isMobile ? '16px' : '24px', textAlign: 'center' }}>
          DAY {day}
        </div>
        <div className={health < 30 ? 'heartbeat' : ''} style={{ width: isMobile ? '120px' : '200px', height: isMobile ? '16px' : '24px', background: '#000', border: isMobile ? '2px solid #fff' : '4px solid #fff', position: 'relative' }}>
           <div style={{ width: `${health}%`, height: '100%', background: '#e74c3c', transition: 'width 0.3s' }} />
        </div>
      </div>

      {/* Split HUD - Right */}
      <div className={isShivering ? 'shiver' : ''} style={{ position: 'absolute', top: isMobile ? 10 : 20, right: isMobile ? 10 : 20, display: 'flex', gap: isMobile ? '5px' : '10px', zIndex: 20 }}>
        <div className="retro-box" style={{ width: isMobile ? '40px' : '60px', height: isMobile ? '40px' : '60px', padding: isMobile ? '5px' : '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: isMobile ? '10px' : '16px' }}>
          <img src="/icon_wood.png" width={isMobile ? "16" : "24"} alt="Wood" />
          <span>{inventory.Wood}</span>
        </div>
        <div className="retro-box" style={{ width: isMobile ? '40px' : '60px', height: isMobile ? '40px' : '60px', padding: isMobile ? '5px' : '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: isMobile ? '10px' : '16px' }}>
          <img src="/icon_stone.png" width={isMobile ? "16" : "24"} alt="Stone" />
          <span>{inventory.Stone}</span>
        </div>
        <div className="retro-box" style={{ width: isMobile ? '40px' : '60px', height: isMobile ? '40px' : '60px', padding: isMobile ? '5px' : '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: isMobile ? '10px' : '16px' }}>
          <img src="/radio_part.png" width={isMobile ? "16" : "24"} alt="Radio" />
          <span>{inventory.Radio}/3</span>
        </div>
        <div className="retro-box" 
             onClick={handleCraftCampfire}
             style={{ width: isMobile ? '40px' : '60px', height: isMobile ? '40px' : '60px', padding: isMobile ? '5px' : '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: canCraft ? '#e67e22' : '#333', cursor: canCraft ? 'pointer' : 'not-allowed', fontSize: isMobile ? '8px' : '10px' }}>
          <span style={{ fontSize: isMobile ? '14px' : '16px' }}>🔥</span><span>CRAFT</span>
        </div>
      </div>
      
      {isShivering && <div className="damage-flash-ui"></div>}
      {health < 30 && (
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 15, pointerEvents: 'none', animation: 'pulseRed 0.5s infinite alternate' }}></div>
      )}
      
      <style>{`
        @keyframes pulseRed {
          from { box-shadow: inset 0 0 0px 0px rgba(255,0,0,0); }
          to { box-shadow: inset 0 0 50px 20px rgba(255,0,0,0.8); }
        }
        .day-flash {
          color: #fada5e !important;
          border-color: #fada5e !important;
          box-shadow: 0 0 20px #fada5e, inset 0 0 20px #fada5e !important;
        }
      `}</style>



      {tutorialState !== 'hidden' && (
        <div className="retro-box" style={{ 
          position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%, -50%)', 
          zIndex: 30, textAlign: 'center', pointerEvents: 'none',
          opacity: tutorialState === 'fading' ? 0 : 1,
          transition: 'opacity 1s ease-in-out',
          fontSize: isMobile ? '12px' : '20px'
        }}>
          {typedTutorial.split('\n').map((line, i) => (
            <span key={i}>{line}<br/></span>
          ))}
        </div>
      )}
      
      <PhaserGame gameRef={gameRef} socket={socket} roomData={roomData} />
      
      {isMobile && <MobileControls onMove={handleJoystickMove} onStop={handleJoystickStop} onChop={handleChop} />}
      {!isMobile && (
        <button 
          className="retro-button"
          onClick={handleChop}
          style={{ position: 'absolute', bottom: 50, right: 50, zIndex: 10, fontSize: '20px', background: '#000', border: '4px solid #fff' }}
        >
          GATHER (SPACE)
        </button>
      )}
    </div>
  );
}
