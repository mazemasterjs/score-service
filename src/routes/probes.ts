import express from 'express';
import {Logger} from '@mazemasterjs/logger';

export const probesRouter = express.Router();

const log: Logger = Logger.getInstance();

// various states of live/ready to return
const RES_LIVE_TRUE: object = {probeType: 'liveness', status: 'alive'};
const RES_READY_TRUE: object = {probeType: 'readiness', status: 'ready'};

/**
 * Liveness probe for container/cloud hosted service monitoring
 */
probesRouter.get('/live', (req, res) => {
    log.trace(__filename, 'Route -> [' + req.url + ']', JSON.stringify(RES_LIVE_TRUE));
    res.status(200).json(RES_LIVE_TRUE);
});

/**
 * Readiness probe for container/cloud hosted service monitoring
 */
probesRouter.get('/ready', (req, res) => {
    log.trace(__filename, 'Route -> [' + req.url + ']', JSON.stringify(RES_READY_TRUE));
    res.status(200).json(RES_READY_TRUE);
});

export default probesRouter;
