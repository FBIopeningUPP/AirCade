import { useRef, useState, useEffect } from 'react';
import PhaserGame from './game/PhaserGame';
import MobileControls from './components/MobileControls';
import './index.css';

export default function App() {
  const gameRef = useRef(null);
  const [gameState, setGameState] = useState('menu'); // 'menu' | 'playing' | 'gameover' | 'win' | 'hosting' | 'scanning' | 'found_survivor'
  const [inventory, setInventory] = useState({ Wood: 0, Stone: 0, Radio: 0 });
  const [health, setHealth] = useState(100);
  const [gameKey, setGameKey] = useState(0);
  const [tutorialState, setTutorialState] = useState('visible');
  const [day, setDay] = useState(1);
  const [dayFlash, setDayFlash] = useState(false);
  const isTouch = navigator.maxTouchPoints > 0;
  const isMobile = window.innerWidth < 768;

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

    const handleNewDay = (newDayCount) => {
      setDay(newDayCount);
      setDayFlash(true);
      setTimeout(() => setDayFlash(false), 2000);
    };

    const checkGame = setInterval(() => {
      if (gameRef.current) {
        gameRef.current.events.on('itemGathered', handleGather);
        gameRef.current.events.on('takeDamage', handleDamage);
        gameRef.current.events.on('newDay', handleNewDay);
        clearInterval(checkGame);
      }
    }, 100);

    return () => {
      clearInterval(checkGame);
      if (gameRef.current) {
        gameRef.current.events.off('itemGathered', handleGather);
        gameRef.current.events.off('takeDamage', handleDamage);
        gameRef.current.events.off('newDay', handleNewDay);
      }
    };
  }, [gameState]);

  useEffect(() => {
    if (inventory.Radio >= 3) {
      setGameState('win');
    }
  }, [inventory.Radio]);

  useEffect(() => {
    if (gameState === 'scanning') {
      const timer = setTimeout(() => {
        setGameState('found_survivor');
      }, 3000);
      return () => clearTimeout(timer);
    }
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
    if (inventory.Wood >= 2 && inventory.Stone >= 1) {
      setInventory(prev => ({
        ...prev,
        Wood: prev.Wood - 2,
        Stone: prev.Stone - 1
      }));
      if (gameRef.current) {
        gameRef.current.events.emit('craftCampfire');
      }
    }
  };

  if (gameState === 'menu') {
    return (
      <div style={{ width: '100vw', height: '100vh', backgroundImage: 'url(/menu_bg.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', zIndex: 1 }}></div>
        <div style={{ zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
          <h1 style={{ fontSize: '4rem', marginBottom: '1rem', textAlign: 'center', color: 'white', textShadow: '0 0 20px rgba(0,0,0,0.8)' }}>AIRCADE: SURVIVAL</h1>
          <button 
            className="retro-button"
            onClick={() => setGameState('hosting')}
            style={{ fontSize: '24px', background: '#2ecc71', color: 'white', width: '400px' }}
          >
            BROADCAST (HOST)
          </button>
          <button 
            className="retro-button"
            onClick={() => setGameState('scanning')}
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
          <button 
            className="retro-button"
            onClick={() => setGameState('playing')}
            style={{ fontSize: '24px', background: '#e67e22', color: 'white', marginTop: '20px' }}
          >
            START SOLO
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
          <h2 style={{ fontSize: '2rem', textAlign: 'center', margin: 0 }}>SURVIVOR FOUND: PLAYER 1</h2>
          <button 
            className="retro-button"
            onClick={() => setGameState('playing')}
            style={{ fontSize: '24px', background: '#2ecc71', color: 'white', marginTop: '20px' }}
          >
            CONNECT VIA BLUETOOTH
          </button>
        </div>
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
            setGameKey(k => k + 1);
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
            setHealth(100);
            setInventory({ Wood: 0, Stone: 0, Radio: 0 });
            setGameKey(k => k + 1);
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

  const canCraft = inventory.Wood >= 2 && inventory.Stone >= 1;

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 10, left: 0, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', zIndex: 20 }}>
        {/* Visual Health Bar */}
        <div style={{ width: '300px', height: '24px', background: '#000', border: '4px solid #fff', position: 'relative' }}>
           <div style={{ width: `${health}%`, height: '100%', background: '#e74c3c', transition: 'width 0.3s' }} />
        </div>

        {/* Hotbar Slots */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <div className="retro-box" style={{ width: '60px', height: '60px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <img src="/icon_wood.png" width="24" alt="Wood" />
            <span>{inventory.Wood}</span>
          </div>
          <div className="retro-box" style={{ width: '60px', height: '60px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <img src="/icon_stone.png" width="24" alt="Stone" />
            <span>{inventory.Stone}</span>
          </div>
          <div className="retro-box" style={{ width: '60px', height: '60px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <img src="/radio_part.png" width="24" alt="Radio" />
            <span>{inventory.Radio}/3</span>
          </div>
          <div className="retro-box" 
               onClick={handleCraftCampfire}
               style={{ width: '60px', height: '60px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: canCraft ? '#e67e22' : '#333', cursor: canCraft ? 'pointer' : 'not-allowed' }}>
            🔥<span style={{ fontSize: '10px' }}>CRAFT</span>
          </div>
        </div>
      </div>
      
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

      {/* Day Counter */}
      <div className={`retro-box ${dayFlash ? 'day-flash' : ''}`} style={{
        position: 'absolute', top: isMobile ? '5px' : '20px', right: isMobile ? '5px' : '20px', zIndex: 20,
        fontSize: isMobile ? '16px' : '24px', transition: 'all 0.3s'
      }}>
        DAY {day}
      </div>

      {tutorialState !== 'hidden' && (
        <div className="retro-box" style={{ 
          position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%, -50%)', 
          zIndex: 30, textAlign: 'center', pointerEvents: 'none',
          opacity: tutorialState === 'fading' ? 0 : 1,
          transition: 'opacity 1s ease-in-out',
          fontSize: isMobile ? '12px' : '20px'
        }}>
          WASD to move | SPACE to gather<br/><br/>
          Build campfires to survive the night<br/><br/>
          Find 3 Radio Parts to escape
        </div>
      )}
      
      <PhaserGame key={gameKey} gameRef={gameRef} />
      
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
    </div>
  );
}
