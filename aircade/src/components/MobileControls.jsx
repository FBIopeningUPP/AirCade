import { Joystick } from 'react-joystick-component';

export default function MobileControls({ onMove, onStop, onChop }) {
  return (
    <>
      <div style={{ position: 'absolute', bottom: 50, left: 50, zIndex: 10 }}>
        <Joystick size={100} baseColor="#333" stickColor="#fff" move={onMove} stop={onStop} />
      </div>
      <button 
        onClick={onChop}
        style={{ position: 'absolute', bottom: 50, right: 50, zIndex: 10, padding: '20px 40px', fontSize: 24, borderRadius: 10, cursor: 'pointer', background: '#e74c3c', color: 'white', border: 'none', fontWeight: 'bold' }}
      >
        CHOP
      </button>
    </>
  );
}
