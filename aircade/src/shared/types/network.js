/**
 * @typedef {Object} InputMsg
 * @property {number} type - 0x10
 * @property {number} seq - uint16
 * @property {number} tick - uint8
 * @property {number} flags - bitpacked INPUT_FLAGS
 * @property {number} joyX - int11
 * @property {number} joyY - int11
 * @property {number} target - targetId(5) | targetType(3)
 */

/**
 * @typedef {Object} SnapshotMsg
 * @property {number} type - 0x01
 * @property {number} tick - uint16
 * @property {number} playerCount - uint2
 * @property {number} localPlayerId - uint2
 * @property {PlayerState[]} players
 * @property {number} darknessAlpha - uint8
 * @property {CampfireState[]} campfires
 * @property {number} lastAckSeq - uint16
 */

/**
 * @typedef {Object} PlayerState
 * @property {number} id
 * @property {number} x
 * @property {number} y
 * @property {number} vx
 * @property {number} vy
 * @property {number} health
 * @property {Object} inventory
 * @property {number} inventory.wood
 * @property {number} inventory.stone
 * @property {number} inventory.radio
 */

/**
 * @typedef {Object} CampfireState
 * @property {number} x
 * @property {number} y
 * @property {number} active
 */

/**
 * @typedef {Object} EventMsg
 * @property {number} type - 0x03
 * @property {number} evtType - EVENT_TYPES
 * @property {number} playerId - uint2
 * @property {number} targetId - uint5 (for GATHER)
 * @property {number} itemId - uint3 (for GATHER)
 * @property {number} qty - uint5 (for GATHER)
 * @property {number} campfireId - uint4 (for CRAFT)
 * @property {number} x - int12 (for CRAFT)
 * @property {number} y - int12 (for CRAFT)
 * @property {number} newHealth - uint7 (for DAMAGE)
 */

/**
 * @typedef {Object} JoinAcceptMsg
 * @property {number} type - 0x30
 * @property {number} playerId - uint2
 * @property {number} worldSeed - uint16
 * @property {SnapshotMsg} snapshot
 */

/**
 * @typedef {Object} PingMsg
 * @property {number} type - 0x21
 * @property {number} seq - uint16
 * @property {number} clientTime - uint32
 */

/**
 * @typedef {Object} PongMsg
 * @property {number} type - 0x31
 * @property {number} seq - uint16
 * @property {number} serverTime - uint32
 * @property {number} clientTime - uint32
 */

/**
 * @typedef {Object} SyncReqMsg
 * @property {number} type - 0x22
 * @property {number} lastTick - uint16
 * @property {number} lastSeq - uint16
 */

/**
 * @typedef {Object} SyncRespMsg
 * @property {number} type - 0x32
 * @property {SnapshotMsg} snapshot
 */