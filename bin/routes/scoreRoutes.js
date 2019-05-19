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
const logger_1 = require("@mazemasterjs/logger");
const DatabaseManager_1 = __importDefault(require("@mazemasterjs/database-manager/DatabaseManager"));
const Score_1 = require("@mazemasterjs/shared-library/Score");
const Trophy_1 = require("@mazemasterjs/shared-library/Trophy");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const Enums_1 = require("@mazemasterjs/shared-library/Enums");
exports.defaultRouter = express_1.default.Router();
// set module references
const log = logger_1.Logger.getInstance();
// declare useful constants
const ROUTE_PATH = '/api/score';
const PROJECTION = {};
// load environment vars
const MONGO_COL_SCORES = process.env.MOGO_COL_SCORES === undefined ? 'scores' : process.env.MOGO_COL_SCORES;
const MONGO_COL_TROPHIES = process.env.MONGO_COL_TROPHIES === undefined ? 'trophies' : process.env.MONGO_COL_TROPHIES;
const SERVICE_DOC_FILE = process.env.SERVICE_DOC_FILE === undefined ? 'service.json' : process.env.SERVICE_DOC_FILE;
const SERVICE_DOC = loadServiceDoc(SERVICE_DOC_FILE);
const TROPHY_DATA_FILE = path_1.default.resolve('data/default-trophy-list.json');
// declare dbMan - initialized during startup
let dbMan;
/**
 * This just assigns mongo the instance of DatabaseManager.  We shouldn't be
 * able to get here without a database connection and existing instance, but
 * we'll do some logging / error checking anyway.
 */
DatabaseManager_1.default.getInstance()
    .then(instance => {
    dbMan = instance;
    log.info(__filename, 'DatabaseManager.getInstance()', 'DatabaseManager is ready for use.');
})
    .catch(err => {
    log.error(__filename, 'DatabaseManager.getInstance()', 'Error getting DatabaseManager instance ->', err);
});
/**
 * Attempt to load the service document from disk and return as json
 *
 * @param file - Relative file name & path
 * */
function loadServiceDoc(file) {
    const absFile = path_1.default.resolve(file);
    if (!fs_1.default.existsSync(absFile)) {
        let error = new Error(`${absFile} not found.`);
        log.error(__filename, `loadServiceDoc(${file})`, 'Error ->', error);
        throw error;
    }
    else {
        return JSON.parse(fs_1.default.readFileSync(absFile, 'UTF-8'));
    }
}
let genTrophies = (req, res) => __awaiter(this, void 0, void 0, function* () {
    log.debug(__filename, req.url, 'Handling request -> ' + req.path);
    if (!fs_1.default.existsSync(TROPHY_DATA_FILE)) {
        log.warn(__filename, 'defaultTrophies()', 'Cannot continue, file not found: ' + Enums_1.DATABASES);
        return;
    }
    let data = JSON.parse(fs_1.default.readFileSync(TROPHY_DATA_FILE, 'UTF-8'));
    for (const tdata of data.trophies) {
        const trophy = new Trophy_1.Trophy(tdata);
        // first try to delete the trophy (it may not exist, but that's ok)
        yield dbMan
            .deleteDocument(MONGO_COL_TROPHIES, { id: trophy.Id })
            .then(result => {
            if (result.deletedCount && result.deletedCount > 0) {
                log.debug(__filename, 'defaultTrophies()', `${result.deletedCount} trophy document(s) with id=${trophy.Id} deleted`);
            }
            else {
                log.debug(__filename, 'defaultTrophies()', `Trophy (id=${trophy.Id}) could not be deleted (may not exist).`);
            }
        })
            .catch(err => {
            log.warn(__filename, 'defaultTrophies()', `Error deleting trophy (id=${trophy.Id}) -> ${err.message}`);
        });
        // now insert the trophy from our json file
        yield dbMan
            .insertDocument(MONGO_COL_TROPHIES, trophy)
            .then(result => {
            log.debug(__filename, 'defaultTrophies()', `Trophy (id=${trophy.Id}) inserted.`);
        })
            .catch(err => {
            log.warn(__filename, 'defaultTrophies()', `Error inserting trophy (id=${trophy.Id}) -> ${err.message}`);
        });
    }
    yield dbMan
        .getDocumentCount(MONGO_COL_TROPHIES)
        .then(count => {
        log.debug(__filename, 'defaultTrophies()', 'Trophy Document Count=' + count);
        res.status(200).json({ message: 'Default trophies generated.', collection: MONGO_COL_TROPHIES, 'trophy-count': count });
    })
        .catch(err => {
        res.status(500).json(err);
    });
});
/**
 * Responds with json value showing the document count in the given collection
 *
 * @param req - express.Request
 * @param res - express.Response
 */
function getCount(colName, req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        log.debug(__filename, req.url, 'Handling request -> ' + req.path);
        yield dbMan
            .getDocumentCount(colName)
            .then(count => {
            log.debug(__filename, `getCount(${colName}, req, res)`, 'Count=' + count);
            res.status(200).json({ collection: colName, count: count });
        })
            .catch(err => {
            res.status(500).json({ error: err.name, message: err.message });
        });
    });
}
/**
 * Returns all documents from the given collection that match the query parameters. If no
 * query parameters are given, all documents will be returned (be careful!)
 *
 * @param colName - collection to query
 * @param req - express request
 * @param res - express response
 */
function getDocs(colName, req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const method = `getDocs(${colName}, req, res)`;
        log.debug(__filename, method, 'Getting requested documents from database.');
        const pageSize = 10;
        let pageNum = 1;
        const query = {};
        let docs = new Array();
        let done = false;
        // build the json object containing score parameters to search for
        for (const key in req.query) {
            query[key] = req.query[key];
        }
        log.debug(__filename, method, `Getting ${colName} with parameter(s): ${JSON.stringify(query)}`);
        try {
            // loop through the paged list of docs and build a return array.
            while (!done) {
                let page = yield dbMan.getDocuments(colName, query, {}, pageSize, pageNum);
                if (page.length > 0) {
                    log.debug(__filename, method, `Page #${pageNum}: Processing ${page.length} documents.`);
                    // can't easily use Array.concat, so have to loop and push
                    for (const doc of page) {
                        // instantiate as Score to validate data
                        switch (colName) {
                            case MONGO_COL_SCORES: {
                                try {
                                    const score = new Score_1.Score(doc);
                                    docs.push(score);
                                }
                                catch (err) {
                                    log.warn(__filename, method, 'Invalid score document found - discarding it.  Database _id=' + doc._id);
                                }
                                break;
                            }
                            case MONGO_COL_TROPHIES: {
                                try {
                                    const trophy = new Trophy_1.Trophy(doc);
                                    docs.push(trophy);
                                }
                                catch (err) {
                                    log.warn(__filename, method, 'Invalid trophy document found - discarding it.  Database _id=' + doc._id);
                                }
                                break;
                            }
                        }
                    }
                }
                // if we don't have at least pageSize elements, we've hit the last page
                if (page.length < pageSize) {
                    done = true;
                    log.debug(__filename, method, `-> Finished. ${docs.length} documents documents collected from ${pageNum} pages.`);
                }
                else {
                    pageNum++;
                }
            }
            // return the results
            log.debug(__filename, method, `Returning ${docs.length} documents from the '${colName}' collection.`);
            if (docs.length === 1) {
                res.status(200).json(docs[0]);
            }
            else {
                res.status(200).json(docs);
            }
        }
        catch (err) {
            // log the error and return message
            log.error(__filename, method, `Error while collecting documents ->`, err);
            return res.status(500).json({ error: err.name, message: err.message });
        }
    });
}
/**
 * Inserts the score from the JSON http body into the mongo database.
 *
 * @param req
 * @param res
 */
let insertScore = (req, res) => __awaiter(this, void 0, void 0, function* () {
    log.debug(__filename, req.url, 'Handling request -> ' + req.path);
    let score;
    // instantiate as Score to validate document body
    try {
        score = new Score_1.Score(req.body);
    }
    catch (err) {
        log.error(__filename, 'insertScore(...)', 'Unable to instantiate Score ->', err);
        return res.status(500).json({ error: err.name, message: err.message });
    }
    yield dbMan
        .insertDocument(MONGO_COL_SCORES, score)
        .then(result => {
        return res.status(200).json(result);
    })
        .catch((err) => {
        log.error(__filename, req.url, 'Error inserting score ->', err);
        return res.status(500).json(err);
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
    log.debug(__filename, req.url, 'Handling request -> ' + req.path);
    let score = req.body;
    // instantiate as Score to validate document body
    try {
        score = new Score_1.Score(req.body);
    }
    catch (err) {
        log.error(__filename, 'insertScore(...)', 'Unable to instantiate Score ->', err);
        return res.status(500).json({ error: err.name, message: err.message });
    }
    yield dbMan
        .updateDocument(MONGO_COL_SCORES, { id: score.id }, score)
        .then(result => {
        log.debug(__filename, `updateScore(${score.id})`, 'Score updated.');
        res.status(200).json(result);
    })
        .catch(err => {
        log.error(__filename, `updateScore(${score.id})`, 'Error updating score ->', err);
        res.status(500).json(err);
    });
});
/**
 * Remove the score document with the ID found in req.id and sends result/count as json response
 *
 * @param req - express.Request
 * @param res - express.Response
 */
let deleteScore = (req, res) => __awaiter(this, void 0, void 0, function* () {
    log.debug(__filename, req.url, 'Handling request -> ' + req.path);
    let query = { id: req.params.scoreId };
    yield dbMan
        .deleteDocument(MONGO_COL_SCORES, query)
        .then(result => {
        log.debug(__filename, req.url, `${result.deletedCount} score(s) deleted.`);
        res.status(200).json(result);
    })
        .catch(err => {
        log.error(__filename, req.url, 'Error deleting score ->', err);
        res.status(500).json(err);
    });
});
/**
 * Responds with the raw JSON service document unless the "?html"
 * parameter is found, in which case it renderse an HTML document
 * @param req
 * @param res
 */
let getServiceDoc = (req, res) => {
    log.debug(__filename, req.url, 'Handling request -> ' + req.path);
    res.status(200).json(SERVICE_DOC);
};
let loadDefaultTrophies;
/**
 * Handles undefined routes
 */
let unhandledRoute = (req, res) => {
    log.warn(__filename, `Route -> [${req.method} -> ${req.url}]`, 'Unhandled route, returning 404.');
    res.status(404).json({
        status: '404',
        message: `Route not found.  See ${ROUTE_PATH}/service for detailed documentation.`,
    });
};
// Route -> http.get mappings
exports.defaultRouter.get('/service', getServiceDoc);
exports.defaultRouter.get('/countScores', (req, res) => {
    getCount(MONGO_COL_SCORES, req, res);
});
exports.defaultRouter.get('/countTrophies', (req, res) => {
    getCount(MONGO_COL_TROPHIES, req, res);
});
exports.defaultRouter.get('/getTrophies', (req, res) => {
    getDocs(MONGO_COL_TROPHIES, req, res);
});
exports.defaultRouter.get('/getScores', (req, res) => {
    getDocs(MONGO_COL_SCORES, req, res);
});
// special routes
exports.defaultRouter.get('/generate/default-trophy-list', genTrophies);
//app.get('/*', (req, res) => {
// Route -> http.put mappings
exports.defaultRouter.put('/insertScore', insertScore);
exports.defaultRouter.put('/updateScore', updateScore);
// Route -> http.delete mappings
exports.defaultRouter.delete('/deleteScore/:scoreId', deleteScore);
// capture all unhandled routes
exports.defaultRouter.get('/*', unhandledRoute);
exports.defaultRouter.put('/*', unhandledRoute);
exports.defaultRouter.delete('/*', unhandledRoute);
exports.defaultRouter.post('/*', unhandledRoute);
// expose router as module
exports.default = exports.defaultRouter;
//# sourceMappingURL=scoreRoutes.js.map