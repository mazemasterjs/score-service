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
const compression_1 = __importDefault(require("compression"));
const body_parser_1 = __importDefault(require("body-parser"));
const util_1 = require("util");
const logger_1 = require("@mazemasterjs/logger");
const scoreRoutes_1 = require("./routes/scoreRoutes");
const probes_1 = require("./routes/probes");
const DatabaseManager_1 = __importDefault(require("@mazemasterjs/database-manager/DatabaseManager"));
const cors_1 = __importDefault(require("cors"));
// load environment vars - not all are used at this level, but I want to validate them all
// here during the intial service startup process
const HTTP_PORT = process.env.HTTP_PORT === undefined ? 8080 : parseInt(process.env.HTTP_PORT + '', 10);
const APP_NAME = process.env.APP_NAME === undefined ? 'NOT_SET' : process.env.APP_NAME;
const LOG_LEVEL = process.env.LOG_LEVEL === undefined ? logger_1.LOG_LEVELS.INFO : parseInt(process.env.LOG_LEVEL + '', 10);
const MONGO_COL_SCORES = process.env.MOGO_COL_SCORES === undefined ? 'scores' : process.env.MOGO_COL_SCORES;
const MONGO_COL_TROPHIES = process.env.MONGO_COL_TROPHIES === undefined ? 'trophies' : process.env.MONGO_COL_TROPHIES;
const SERVICE_DOC_FILE = process.env.SERVICE_DOC_FILE === undefined ? 'service.json' : process.env.SERVICE_DOC_FILE;
// set up logger
const log = logger_1.Logger.getInstance();
log.LogLevel = LOG_LEVEL;
// create express app
const app = express_1.default();
// prep reference for express server
let httpServer;
// prep reference for
let dbMan;
/**
 * APPLICATION ENTRY POINT
 */
function startService() {
    return __awaiter(this, void 0, void 0, function* () {
        log.info(__filename, 'startService()', 'Validating environment-based configuration...');
        validateConfig();
        log.info(__filename, 'startService()', 'Opening database connection...');
        yield DatabaseManager_1.default.getInstance()
            .then((instance) => {
            dbMan = instance;
            log.debug(__filename, 'startService()', 'Database connection ready, launch Express server.');
            launchExpress();
        })
            .catch((err) => {
            log.error(__filename, 'startService()', 'Unable to connect to database.', err);
            doShutdown();
        });
    });
}
/**
 * Check expected environment vars and respond appropriately
 */
function validateConfig() {
    if (process.env.HTTP_PORT === undefined) {
        log.warn(__filename, 'validateConfig()', `HTTP_PORT not set, defaulted to [${HTTP_PORT}]`);
    }
    else {
        log.info(__filename, 'validateConfig()', `HTTP_PORT: [${HTTP_PORT}]`);
    }
    if (process.env.APP_NAME === undefined) {
        log.warn(__filename, 'validateConfig()', `APP_NAME not set, defaulted to [${APP_NAME}]`);
    }
    else {
        log.info(__filename, 'validateConfig()', `APP_NAME: [${APP_NAME}]`);
    }
    if (process.env.MONGO_COL_SCORES === undefined) {
        log.warn(__filename, 'validateConfig()', `MONGO_COL_SCORES not set, defaulted to [${MONGO_COL_SCORES}]`);
    }
    else {
        log.info(__filename, 'validateConfig()', `MONGO_COL_SCORES: [${MONGO_COL_SCORES}]`);
    }
    if (process.env.MONGO_COL_TROPHIES === undefined) {
        log.warn(__filename, 'validateConfig()', `MONGO_COL_TROPHIES not set, defaulted to [${MONGO_COL_TROPHIES}]`);
    }
    else {
        log.info(__filename, 'validateConfig()', `MONGO_COL_TROPHIES: [${MONGO_COL_TROPHIES}]`);
    }
    if (process.env.SERVICE_DOC_FILE === undefined) {
        log.warn(__filename, 'validateConfig()', `SERVICE_DOC_FILE not set, defaulted to [${SERVICE_DOC_FILE}]`);
    }
    else {
        log.info(__filename, 'validateConfig()', `SERVICE_DOC_FILE: [${SERVICE_DOC_FILE}]`);
    }
    if (process.env.LOG_LEVEL === undefined) {
        log.warn(__filename, 'validateConfig()', `LOG_LEVEL not set, defaulted to [${LOG_LEVEL}]`);
    }
    else {
        log.info(__filename, 'validateConfig()', `LOG_LEVEL: [${logger_1.LOG_LEVELS[LOG_LEVEL]}] (${LOG_LEVEL})`);
    }
}
/**
 * Starts up the express server
 */
function launchExpress() {
    log.debug(__filename, 'launchExpress()', 'Configuring express HTTPServer...');
    // allow cross-origin-resource-sharing
    app.use(cors_1.default());
    // enable http compression middleware
    app.use(compression_1.default());
    // enable ejs view rendering engine
    app.set('view engine', 'ejs');
    // enable bodyParser middleware for json
    // TODO: Remove this if we aren't accepting post/put with JSON data
    app.use(body_parser_1.default.urlencoded({ extended: true }));
    // have to do a little dance around bodyParser.json() to verify request body so that
    // errors can be captured, logged, and responded to cleanly
    app.use((req, res, next) => {
        body_parser_1.default.json({
            verify: addReqBody
        })(req, res, (err) => {
            if (err) {
                log.error(__filename, 'app.bodyParser.json()', 'Error encountered while parsing json body.', err);
                res.status(500).json({ status: '400', message: `Unable to parse JSON Body : ${err.name} - ${err.message}` });
                return;
            }
            else {
                log.trace(__filename, `bodyParser(${req.url}, res, next).json`, 'bodyParser.json() completed successfully.');
            }
            next();
        });
    });
    // set up the probes router (live/ready checks)
    app.use('/api/score/probes', probes_1.probesRouter);
    // set up the default route handler
    app.use('/api/score', scoreRoutes_1.defaultRouter);
    // catch-all for unhandled requests
    app.get('/*', (req, res) => {
        log.debug(__filename, req.url, 'Invalid Route Requested -> ' + req.url);
        res.status(400).json({
            status: '400',
            message: util_1.format('Invalid request - route not handled.')
        });
    });
    // and start the httpServer - starts the service
    httpServer = app.listen(HTTP_PORT, () => {
        // sever is now listening - live probe should be active, but ready probe must wait for routes to be mapped.
        log.info(__filename, 'launchExpress()', util_1.format('MazeMasterJS/%s -> Service is now LIVE, READY, and listening on port %d.', APP_NAME, HTTP_PORT));
    });
}
/**
 * Called by bodyParser.json() to allow handling of JSON errors in submitted
 * put/post document bodies.
 *
 * @param req
 * @param res
 * @param buf
 */
function addReqBody(req, res, buf) {
    req.body = buf.toString();
}
/**
 * Watch for SIGINT (process interrupt signal) and trigger shutdown
 */
process.on('SIGINT', function onSigInt() {
    // all done, close the db connection
    log.force(__filename, 'onSigInt()', 'Got SIGINT - Exiting application...');
    doShutdown();
});
/**
 * Watch for SIGTERM (process terminate signal) and trigger shutdown
 */
process.on('SIGTERM', function onSigTerm() {
    // all done, close the db connection
    log.force(__filename, 'onSigTerm()', 'Got SIGTERM - Exiting application...');
    doShutdown();
});
/**
 * Gracefully shut down the service
 */
function doShutdown() {
    log.force(__filename, 'doShutDown()', 'Service shutdown commenced.');
    if (dbMan) {
        log.force(__filename, 'doShutDown()', 'Closing DB connections...');
        dbMan.disconnect();
    }
    if (httpServer) {
        log.force(__filename, 'doShutDown()', 'Shutting down HTTPServer...');
        httpServer.close();
    }
    log.force(__filename, 'doShutDown()', 'Exiting process...');
    process.exit(0);
}
// Let's light the tires and kick the fires...
startService();
//# sourceMappingURL=service.js.map