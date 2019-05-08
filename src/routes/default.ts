import express from 'express';
import {format as fmt} from 'util';
import {Logger} from '@mazemasterjs/logger';
import Config from '@mazemasterjs/shared-library/Config';
import Service from '@mazemasterjs/shared-library/Service';
import DatabaseManager from '@mazemasterjs/database-manager/DatabaseManager';
import Score from '@mazemasterjs/shared-library/Score';

export const defaultRouter = express.Router();

const log: Logger = Logger.getInstance();
const config: Config = Config.getInstance();
const ROUTE_PATH: string = '/api/maze';
let dbMan: DatabaseManager;

/**
 * This just assigns mongo the instance of DatabaseManager.  We shouldn't be
 * able to get here without a database connection and existing instance, but
 * we'll do some logging / error checking anyway.
 */
DatabaseManager.getInstance()
    .then((instance) => {
        dbMan = instance;
        // enable the "readiness" probe that tells OpenShift that it can send traffic to this service's pod
        config.READY_TO_ROCK = true;
        log.info(__filename, 'DatabaseManager.getInstance()', 'Service is now LIVE, READY, and taking requests.');
    })
    .catch((err) => {
        log.error(__filename, 'DatabaseManager.getInstance()', 'Error getting DatabaseManager instance ->', err);
    });

/**
 * Response with json score-count value showing the count of all score documents found
 * in the score collection.
 *
 * @param req - express.Request
 * @param res - express.Response
 */
let getScoreCount = async (req: express.Request, res: express.Response) => {
    log.trace(__filename, req.url, 'Handling request -> ' + rebuildUrl(req));
    await dbMan
        .countDocuments(config.MONGO_COL_SCORES)
        .then((count) => {
            log.debug(__filename, 'getScoreCount()', 'Score Count=' + count);
            res.status(200).json({collection: config.MONGO_COL_SCORES, 'score-count': count});
        })
        .catch((err) => {
            res.status(500).json({status: '500', message: err.message});
        });
};

/**
 * Inserts the score from the JSON http body into the mongo database.
 *
 * @param req
 * @param res
 */
let insertScore = async (req: express.Request, res: express.Response) => {
    log.debug(__filename, req.url, 'Handling request -> ' + rebuildUrl(req));

    let score = req.body;

    await dbMan
        .insertDocument(config.MONGO_COL_SCORES, score)
        .then((result) => {
            res.status(200).json(result);
        })
        .catch((err: Error) => {
            log.error(__filename, req.url, 'Error inserting score ->', err);
            res.status(400).json({status: '400', message: `${err.name} - ${err.message}`});
        });
};

/**
 * Updates the given score with data from json body.
 * ScoreID is pulled from json body as well.
 *
 * @param req
 * @param res
 */
let updateScore = async (req: express.Request, res: express.Response) => {
    log.trace(__filename, req.url, 'Handling request -> ' + rebuildUrl(req));
    let score = req.body;

    await dbMan
        .updateDocument(config.MONGO_COL_SCORES, score.id, score)
        .then((result) => {
            res.status(200).json(result);
        })
        .catch((err) => {
            log.error(__filename, req.url, 'Error updating score ->', err);
            res.status(500).json({status: '500', message: `${err.name} - ${err.message}`});
        });
};

/**
 * Remove the score document with the ID found in req.id and sends result/count as json response
 *
 * @param req - express.Request
 * @param res - express.Response
 */
let deleteScore = async (req: express.Request, res: express.Response) => {
    log.trace(__filename, req.url, 'Handling request -> ' + rebuildUrl(req));
    let ret = await dbMan.deleteDocument(config.MONGO_COL_SCORES, req.params.id);

    // check for errors and respond correctly
    if (ret instanceof Error) {
        res.status(500).json({error: ret.name, message: ret.message});
    } else {
        res.status(200).json(ret);
    }
};

/**
 * Responds with the raw JSON service document unless the "?html"
 * parameter is found, in which case it renderse an HTML document
 * @param req
 * @param res
 */
let getServiceDoc = (req: express.Request, res: express.Response) => {
    log.trace(__filename, `Route -> [${req.url}]`, 'Handling request.');
    res.status(200).json(config.SERVICE_DOC);
};

/**
 * Handles undefined routes
 */
let unhandledRoute = (req: express.Request, res: express.Response) => {
    log.warn(__filename, `Route -> [${req.method} -> ${req.url}]`, 'Unhandled route, returning 404.');
    res.status(404).json({
        status: '404',
        message: 'Route not found.  See service documentation for a list of endpoints.',
        'service-document': getSvcDocUrl
    });
};

/**
 * Generate and a string-based link to the service document's help section using the
 * given request to determine URL parameters.
 *
 * @param req
 */
function getSvcDocUrl(req: express.Request): string {
    let svcData: Service = config.SERVICE_DOC;
    let ep = svcData.getEndpointByName('service');
    return fmt('%s%s%s', getProtocolHostPort(req), svcData.BaseUrl, ep.Url);
}

/**
 * Reconstruct the URL from the Express Request object
 * @param req
 */
function rebuildUrl(req: express.Request): string {
    return fmt('%s%s%s', getProtocolHostPort(req), ROUTE_PATH, req.path);
}

/**
 * Get and return the protocol, host, and port for the current
 * request.
 *
 * @param req
 */
function getProtocolHostPort(req: express.Request): string {
    return fmt('%s://%s', req.protocol, req.get('host'));
}

// Route -> http.get mappings
defaultRouter.get('/get/count', getScoreCount);
// defaultRouter.get('/get/all', getMazes);
// defaultRouter.get('/get/:id', getMaze);
defaultRouter.get('/service', getServiceDoc);

// Route -> http.put mappings
defaultRouter.put('/insert', insertScore);
defaultRouter.put('/update', updateScore);

// Route -> http.delete mappings
defaultRouter.delete('/delete/:id', deleteScore);

// capture all unhandled routes
defaultRouter.get('/*', unhandledRoute);
defaultRouter.put('/*', unhandledRoute);
defaultRouter.delete('/*', unhandledRoute);
defaultRouter.post('/*', unhandledRoute);

// expose router as module
export default defaultRouter;
