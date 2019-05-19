"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const logger_1 = require("@mazemasterjs/logger");
exports.probesRouter = express_1.default.Router();
const log = logger_1.Logger.getInstance();
// various states of live/ready to return
const RES_LIVE_TRUE = { probeType: 'liveness', status: 'alive' };
const RES_READY_TRUE = { probeType: 'readiness', status: 'ready' };
/**
 * Liveness probe for container/cloud hosted service monitoring
 */
exports.probesRouter.get('/live', (req, res) => {
    log.trace(__filename, 'Route -> [' + req.url + ']', JSON.stringify(RES_LIVE_TRUE));
    res.status(200).json(RES_LIVE_TRUE);
});
/**
 * Readiness probe for container/cloud hosted service monitoring
 */
exports.probesRouter.get('/ready', (req, res) => {
    log.trace(__filename, 'Route -> [' + req.url + ']', JSON.stringify(RES_READY_TRUE));
    res.status(200).json(RES_READY_TRUE);
});
exports.default = exports.probesRouter;
//# sourceMappingURL=probes.js.map