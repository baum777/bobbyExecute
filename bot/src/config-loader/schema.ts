/**
 * Config schema - re-exports from normalized config layer.
 * config/ is the single owner; this preserves backward compatibility.
 */
export {
  ConfigSchema,
  parseConfig,
  ExecutionModeSchema,
  RpcModeSchema,
  type Config,
  type ExecutionMode,
  type RpcMode,
} from "../config/config-schema.js";
