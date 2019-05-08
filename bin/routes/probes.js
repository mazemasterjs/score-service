"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const logger_1 = require("@mazemasterjs/logger");
const Config_1 = __importDefault(require("@mazemasterjs/shared-library/Config"));
exports.probesRouter = express_1.default.Router();
const log = logger_1.Logger.getInstance();
const config = Config_1.default.getInstance();
const RES_LIVE_TRUE = { probeType: 'liveness', status: 'alive' };
const RES_LIVE_WAIT = { probeType: 'liveness', status: 'awaiting-ready' };
const RES_READY_TRUE = { probeType: 'readiness', status: 'ready' };
const RES_READY_WAIT = { probeType: 'readiness', status: 'not-ready' };
/**
 * Liveness probe for container/cloud hosted service monitoring
 */
exports.probesRouter.get('/live', (req, res) => {
    log.trace(__filename, 'Route -> [' + req.url + ']', 'Handling request.');
    if (config.READY_TO_ROCK) {
        log.trace(__filename, 'Route -> [' + req.url + ']', JSON.stringify(RES_LIVE_TRUE));
        res.status(200).json(RES_LIVE_TRUE);
    }
    else {
        log.force(__filename, 'Route -> [' + req.url + ']', JSON.stringify(RES_LIVE_WAIT));
        res.status(500).json(RES_LIVE_WAIT);
    }
    log.trace(__filename, 'Route -> [' + req.url + ']', 'Response complete.');
});
/**
 * Readiness probe for container/cloud hosted service monitoring
 */
exports.probesRouter.get('/ready', (req, res) => {
    log.trace(__filename, 'Route -> [' + req.url + ']', 'Handling request.');
    if (config.READY_TO_ROCK) {
        log.trace(__filename, 'Route -> [' + req.url + ']', JSON.stringify(RES_READY_TRUE));
        res.status(200).json(RES_READY_TRUE);
    }
    else {
        log.force(__filename, 'Route -> [' + req.url + ']', JSON.stringify(RES_READY_WAIT));
        res.status(500).json(RES_READY_WAIT);
    }
    log.trace(__filename, 'Route -> [' + req.url + ']', 'Response complete.');
});
exports.default = exports.probesRouter;
//# sourceMappingURL=probes.js.map