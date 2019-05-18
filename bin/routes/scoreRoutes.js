"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const util_1 = require("util");
const logger_1 = require("@mazemasterjs/logger");
const Config_1 = __importDefault(require("@mazemasterjs/shared-library/Config"));
const DatabaseManager_1 = __importDefault(require("@mazemasterjs/database-manager/DatabaseManager"));
const Score_1 = require("@mazemasterjs/shared-library/Score");
exports.defaultRouter = express_1.default.Router();
// set module references
const log = logger_1.Logger.getInstance();
const config = Config_1.default.getInstance();
// declare useful constants
const ROUTE_PATH = '/api/score';
const PROJECTION = {};
// declare dbMan - initialized during startup
let dbMan;
/**
 * This just assigns mongo the instance of DatabaseManager.  We shouldn't be
 * able to get here without a database connection and existing instance, but
 * we'll do some logging / error checking anyway.
 */
DatabaseManager_1.default.getInstance()
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
let getScoreCount = (req, res) => __awaiter(this, void 0, void 0, function* () {
    log.debug(__filename, req.url, 'Handling request -> ' + rebuildUrl(req));
    yield dbMan
        .getDocumentCount(config.MONGO_COL_SCORES)
        .then((count) => {
        log.debug(__filename, 'getScoreCount()', 'Score Count=' + count);
        res.status(200).json({ collection: config.MONGO_COL_SCORES, 'score-count': count });
    })
        .catch((err) => {
        res.status(500).json({ status: '500', message: err.message });
    });
});
/**
 * Deletes all mazes found matching the given query parameters
 *
 * @param req
 * @param res
 */
let getScores = (req, res) => __awaiter(this, void 0, void 0, function* () {
    log.debug(__filename, req.url, 'Handling request -> ' + rebuildUrl(req));
    const pageSize = 10;
    let pageNum = 1;
    const query = {};
    let scores = new Array();
    let done = false;
    // build the json object containing score parameters to search for
    for (const key in req.query) {
        query[key] = req.query[key];
    }
    log.debug(__filename, 'getScores()', `Querying scores with parameter(s): ${JSON.stringify(query)}`);
    try {
        // loop through the paged list of scores and return all that match the given query parameters
        while (!done) {
            let page = yield dbMan.getDocuments(config.MONGO_COL_SCORES, query, PROJECTION, pageSize, pageNum);
            if (page.length > 0) {
                log.debug(__filename, 'getScores()', `-> Page #${pageNum}, pushing ${page.length} documents into scores array.`);
                // can't easily use Array.concat, so have to loop and push
                for (const scoreDoc of page) {
                    // instantiate as Score to validate data
                    try {
                        const score = new Score_1.Score(scoreDoc);
                        scores.push(score);
                    }
                    catch (err) {
                        log.warn(__filename, 'getScores()', 'Invalid score document found in database: _id=' + scoreDoc._id);
                    }
                }
            }
            // if we don't have at least pageSize elements, we've hit the last page
            if (page.length < pageSize) {
                done = true;
                log.debug(__filename, 'getScores()', `-> Finished. ${scores.length} score documents collected from ${pageNum} pages.`);
            }
            else {
                pageNum++;
            }
        }
        // return the results
        log.debug(__filename, 'getScores()', `Returning ${scores.length} scores.`);
        if (scores.length === 1) {
            res.status(200).json(scores[0]);
        }
        else {
            res.status(200).json(scores);
        }
    }
    catch (err) {
        // log the error and return message
        log.error(__filename, 'getScores()', `Error while collecting scores ->`, err);
        res.status(500).json({ status: '500', message: err.message });
    }
});
/**
 * Inserts the score from the JSON http body into the mongo database.
 *
 * @param req
 * @param res
 */
let insertScore = (req, res) => __awaiter(this, void 0, void 0, function* () {
    log.debug(__filename, req.url, 'Handling request -> ' + rebuildUrl(req));
    let score;
    // instantiate as Score to validate document body
    try {
        score = new Score_1.Score(req.body);
    }
    catch (err) {
        log.error(__filename, 'insertScore(...)', 'Unable to instantiate Score ->', err);
        return res.status(500).json({ status: '500', message: `${err.name} - ${err.message}` });
    }
    yield dbMan
        .insertDocument(config.MONGO_COL_SCORES, score)
        .then((result) => {
        res.status(200).json(result);
    })
        .catch((err) => {
        log.error(__filename, req.url, 'Error inserting score ->', err);
        res.status(400).json(err);
    });
});
/**
 * Updates the given score with data from json body.
 * ScoreID is pulled from json body as well.
 *
 * @param req
 * @param res
 */
let updateScore = (req, res) => __awaiter(this, void 0, void 0, function* () {
    log.debug(__filename, req.url, 'Handling request -> ' + rebuildUrl(req));
    let score = req.body;
    // instantiate as Score to validate document body
    try {
        score = new Score_1.Score(req.body);
    }
    catch (err) {
        log.error(__filename, 'insertScore(...)', 'Unable to instantiate Score ->', err);
        return res.status(500).json({ status: '500', message: `${err.name} - ${err.message}` });
    }
    yield dbMan
        .updateDocument(config.MONGO_COL_SCORES, { id: score.id }, score)
        .then((result) => {
        log.debug(__filename, `updateScore(${score.id})`, 'Score updated.');
        res.status(200).json(result);
    })
        .catch((err) => {
        log.error(__filename, `updateScore(${score.id})`, 'Error updating score ->', err);
        res.status(500).json({ status: '500', message: `${err.name} - ${err.message}` });
    });
});
/**
 * Remove the score document with the ID found in req.id and sends result/count as json response
 *
 * @param req - express.Request
 * @param res - express.Response
 */
let deleteScore = (req, res) => __awaiter(this, void 0, void 0, function* () {
    log.debug(__filename, req.url, 'Handling request -> ' + rebuildUrl(req));
    let query = { id: req.params.scoreId };
    yield dbMan
        .deleteDocument(config.MONGO_COL_SCORES, query)
        .then((result) => {
        log.debug(__filename, req.url, `${result.deletedCount} score(s) deleted.`);
        res.status(200).json(result);
    })
        .catch((err) => {
        log.error(__filename, req.url, 'Error deleting score ->', err);
        res.status(500).json({ status: '500', message: `${err.name} - ${err.message}` });
    });
});
/**
 * Responds with the raw JSON service document unless the "?html"
 * parameter is found, in which case it renderse an HTML document
 * @param req
 * @param res
 */
let getServiceDoc = (req, res) => {
    log.debug(__filename, `Route -> [${req.url}]`, 'Handling request.');
    res.status(200).json(config.SERVICE_DOC);
};
/**
 * Handles undefined routes
 */
let unhandledRoute = (req, res) => {
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
function getSvcDocUrl(req) {
    let svcData = config.SERVICE_DOC;
    let ep = svcData.getEndpointByName('service');
    return util_1.format('%s%s%s', getProtocolHostPort(req), svcData.BaseUrl, ep.Url);
}
/**
 * Reconstruct the URL from the Express Request object
 * @param req
 */
function rebuildUrl(req) {
    return util_1.format('%s%s%s', getProtocolHostPort(req), ROUTE_PATH, req.path);
}
/**
 * Get and return the protocol, host, and port for the current
 * request.
 *
 * @param req
 */
function getProtocolHostPort(req) {
    return util_1.format('%s://%s', req.protocol, req.get('host'));
}
// Route -> http.get mappings
exports.defaultRouter.get('/get/count', getScoreCount);
exports.defaultRouter.get('/get', getScores);
exports.defaultRouter.get('/service', getServiceDoc);
// Route -> http.put mappings
exports.defaultRouter.put('/insert', insertScore);
exports.defaultRouter.put('/update', updateScore);
// Route -> http.delete mappings
exports.defaultRouter.delete('/delete/:scoreId', deleteScore);
// capture all unhandled routes
exports.defaultRouter.get('/*', unhandledRoute);
exports.defaultRouter.put('/*', unhandledRoute);
exports.defaultRouter.delete('/*', unhandledRoute);
exports.defaultRouter.post('/*', unhandledRoute);
// expose router as module
exports.default = exports.defaultRouter;
//# sourceMappingURL=scoreRoutes.js.map