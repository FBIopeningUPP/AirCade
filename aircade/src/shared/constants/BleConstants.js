export const BLE = {
  SERVICE_UUID: '0xA1C0',
  CHAR_STATE_UUID: '0xA1C1',
  CHAR_INPUT_UUID: '0xA1C2',
  CHAR_CONTROL_UUID: '0xA1C3',

  MTU: 512,
  CONN_INTERVAL_MIN: 15,
  CONN_INTERVAL_MAX: 30,
  TICK_RATE: 20,
  TICK_MS: 50,

  MSG_TYPES: {
    SNAPSHOT: 0x01,
    DELTA: 0x02,
    EVENT: 0x03,
    JOIN_ACCEPT: 0x30,
    PONG: 0x31,
    SYNC_RESP: 0x32,
    INPUT: 0x10,
    JOIN_REQ: 0x20,
    PING: 0x21,
    SYNC_REQ: 0x22,
  },

  INPUT_FLAGS: {
    UP: 1 << 0,
    DOWN: 1 << 1,
    LEFT: 1 << 2,
    RIGHT: 1 << 3,
    CHOP: 1 << 4,
    CRAFT: 1 << 5,
  },

  EVENT_TYPES: {
    GATHER: 0x01,
    CRAFT: 0x02,
    DAMAGE: 0x03,
    WIN: 0x04,
    PLAYER_JOINED: 0x05,
    PLAYER_LEFT: 0x06,
  },

  ITEM_IDS: {
    WOOD: 0,
    STONE: 1,
    RADIO: 2,
  },

  ENTITY_TYPES: {
    TREE: 0,
    ROCK: 1,
    RADIO: 2,
  },
};

// TODO: move MTU negotiation to runtime detection