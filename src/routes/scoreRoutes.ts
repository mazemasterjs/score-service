import express from 'express';
import { Logger } from '@mazemasterjs/logger';
import DatabaseManager from '@mazemasterjs/database-manager/DatabaseManager';
import { Score } from '@mazemasterjs/shared-library/Score';
import { Trophy } from '@mazemasterjs/shared-library/Trophy';
import fs from 'fs';
import path from 'path';
import { DATABASES } from '@mazemasterjs/shared-library/Enums';

export const defaultRouter = express.Router();

// set module references
const log: Logger = Logger.getInstance();

// declare useful constants
const ROUTE_PATH: string = '/api/score';
const PROJECTION = {};

// load environment vars
const MONGO_COL_SCORES = process.env.MOGO_COL_SCORES === undefined ? 'scores' : process.env.MOGO_COL_SCORES;
const MONGO_COL_TROPHIES = process.env.MONGO_COL_TROPHIES === undefined ? 'trophies' : process.env.MONGO_COL_TROPHIES;
const SERVICE_DOC_FILE = process.env.SERVICE_DOC_FILE === undefined ? 'service.json' : process.env.SERVICE_DOC_FILE;
const SERVICE_DOC = loadServiceDoc(SERVICE_DOC_FILE);
const TROPHY_DATA_FILE = path.resolve('data/default-trophy-list.json');

// declare dbMan - initialized during startup
let dbMan: DatabaseManager;

/**
 * This just assigns mongo the instance of DatabaseManager.  We shouldn't be
 * able to get here without a database connection and existing instance, but
 * we'll do some logging / error checking anyway.
 */
DatabaseManager.getInstance()
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
function loadServiceDoc(file: string): any {
  const absFile = path.resolve(file);

  if (!fs.existsSync(absFile)) {
    let error: Error = new Error(`${absFile} not found.`);
    log.error(__filename, `loadServiceDoc(${file})`, 'Error ->', error);
    throw error;
  } else {
    return JSON.parse(fs.readFileSync(absFile, 'UTF-8'));
  }
}

let genTrophies = async (req: express.Request, res: express.Response) => {
  log.debug(__filename, req.url, 'Handling request -> ' + req.path);

  if (!fs.existsSync(TROPHY_DATA_FILE)) {
    log.warn(__filename, 'defaultTrophies()', 'Cannot continue, file not found: ' + DATABASES);
    return;
  }

  let data = JSON.parse(fs.readFileSync(TROPHY_DATA_FILE, 'UTF-8'));
  for (const tdata of data.trophies) {
    const trophy: Trophy = new Trophy(tdata);

    // first try to delete the trophy (it may not exist, but that's ok)
    await dbMan
      .deleteDocument(MONGO_COL_TROPHIES, { id: trophy.Id })
      .then(result => {
        if (result.deletedCount && result.deletedCount > 0) {
          log.debug(__filename, 'defaultTrophies()', `${result.deletedCount} trophy document(s) with id=${trophy.Id} deleted`);
        } else {
          log.debug(__filename, 'defaultTrophies()', `Trophy (id=${trophy.Id}) could not be deleted (may not exist).`);
        }
      })
      .catch(err => {
        log.warn(__filename, 'defaultTrophies()', `Error deleting trophy (id=${trophy.Id}) -> ${err.message}`);
      });

    // now insert the trophy from our json file
    await dbMan
      .insertDocument(MONGO_COL_TROPHIES, trophy)
      .then(result => {
        log.debug(__filename, 'defaultTrophies()', `Trophy (id=${trophy.Id}) inserted.`);
      })
      .catch(err => {
        log.warn(__filename, 'defaultTrophies()', `Error inserting trophy (id=${trophy.Id}) -> ${err.message}`);
      });
  }

  await dbMan
    .getDocumentCount(MONGO_COL_TROPHIES)
    .then(count => {
      log.debug(__filename, 'defaultTrophies()', 'Trophy Document Count=' + count);
      res.status(200).json({ message: 'Default trophies generated.', collection: MONGO_COL_TROPHIES, 'trophy-count': count });
    })
    .catch(err => {
      res.status(500).json(err);
    });
};

/**
 * Responds with json value showing the document count in the given collection
 *
 * @param req - express.Request
 * @param res - express.Response
 */
async function getCount(colName: string, req: express.Request, res: express.Response) {
  log.debug(__filename, req.url, 'Handling request -> ' + req.path);
  await dbMan
    .getDocumentCount(colName)
    .then(count => {
      log.debug(__filename, `getCount(${colName}, req, res)`, 'Count=' + count);
      res.status(200).json({ collection: colName, count: count });
    })
    .catch(err => {
      res.status(500).json({ error: err.name, message: err.message });
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
async function getDocs(colName: string, req: express.Request, res: express.Response) {
  const method = `getDocs(${colName}, req, res)`;
  log.debug(__filename, method, 'Getting requested documents from database.');

  const pageSize = 10;
  let pageNum = 1;
  const query: any = {};
  let docs = new Array<any>();
  let done = false;

  // build the json object containing score parameters to search for
  for (const key in req.query) {
    query[key] = req.query[key];
  }

  log.debug(__filename, method, `Getting ${colName} with parameter(s): ${JSON.stringify(query)}`);

  try {
    // loop through the paged list of docs and build a return array.
    while (!done) {
      let page = await dbMan.getDocuments(colName, query, {}, pageSize, pageNum);

      if (page.length > 0) {
        log.debug(__filename, method, `Page #${pageNum}: Processing ${page.length} documents.`);

        // can't easily use Array.concat, so have to loop and push
        for (const doc of page) {
          // instantiate as Score to validate data
          switch (colName) {
            case MONGO_COL_SCORES: {
              try {
                const score = new Score(doc);
                docs.push(score);
              } catch (err) {
                log.warn(__filename, method, 'Invalid score document found - discarding it.  Database _id=' + doc._id);
              }
              break;
            }
            case MONGO_COL_TROPHIES: {
              try {
                const trophy = new Trophy(doc);
                docs.push(trophy);
              } catch (err) {
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
      } else {
        pageNum++;
      }
    }

    // return the results
    log.debug(__filename, method, `Returning ${docs.length} documents from the '${colName}' collection.`);
    if (docs.length === 1) {
      res.status(200).json(docs[0]);
    } else {
      res.status(200).json(docs);
    }
  } catch (err) {
    // log the error and return message
    log.error(__filename, method, `Error while collecting documents ->`, err);
    return res.status(500).json({ error: err.name, message: err.message });
  }
}

/**
 * Inserts the score from the JSON http body into the mongo database.
 *
 * @param req
 * @param res
 */
let insertScore = async (req: express.Request, res: express.Response) => {
  log.debug(__filename, req.url, 'Handling request -> ' + req.path);
  let score: Score;

  // instantiate as Score to validate document body
  try {
    score = new Score(req.body);
  } catch (err) {
    log.error(__filename, 'insertScore(...)', 'Unable to instantiate Score ->', err);
    return res.status(500).json({ error: err.name, message: err.message });
  }

  await dbMan
    .insertDocument(MONGO_COL_SCORES, score)
    .then(result => {
      return res.status(200).json(result);
    })
    .catch((err: Error) => {
      log.error(__filename, req.url, 'Error inserting score ->', err);
      return res.status(500).json(err);
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
  log.debug(__filename, req.url, 'Handling request -> ' + req.path);
  let score = req.body;

  // instantiate as Score to validate document body
  try {
    score = new Score(req.body);
  } catch (err) {
    log.error(__filename, 'insertScore(...)', 'Unable to instantiate Score ->', err);
    return res.status(500).json({ error: err.name, message: err.message });
  }

  await dbMan
    .updateDocument(MONGO_COL_SCORES, { id: score.id }, score)
    .then(result => {
      log.debug(__filename, `updateScore(${score.id})`, 'Score updated.');
      res.status(200).json(result);
    })
    .catch(err => {
      log.error(__filename, `updateScore(${score.id})`, 'Error updating score ->', err);
      res.status(500).json(err);
    });
};

/**
 * Remove the score document with the ID found in req.id and sends result/count as json response
 *
 * @param req - express.Request
 * @param res - express.Response
 */
let deleteScore = async (req: express.Request, res: express.Response) => {
  log.debug(__filename, req.url, 'Handling request -> ' + req.path);
  let query: any = { id: req.params.scoreId };

  await dbMan
    .deleteDocument(MONGO_COL_SCORES, query)
    .then(result => {
      log.debug(__filename, req.url, `${result.deletedCount} score(s) deleted.`);
      res.status(200).json(result);
    })
    .catch(err => {
      log.error(__filename, req.url, 'Error deleting score ->', err);
      res.status(500).json(err);
    });
};

/**
 * Responds with the raw JSON service document unless the "?html"
 * parameter is found, in which case it renderse an HTML document
 * @param req
 * @param res
 */
let getServiceDoc = (req: express.Request, res: express.Response) => {
  log.debug(__filename, req.url, 'Handling request -> ' + req.path);
  res.status(200).json(SERVICE_DOC);
};

let loadDefaultTrophies;

/**
 * Handles undefined routes
 */
let unhandledRoute = (req: express.Request, res: express.Response) => {
  log.warn(__filename, `Route -> [${req.method} -> ${req.url}]`, 'Unhandled route, returning 404.');
  res.status(404).json({
    status: '404',
    message: `Route not found.  See ${ROUTE_PATH}/service for detailed documentation.`,
  });
};

// Route -> http.get mappings
defaultRouter.get('/service', getServiceDoc);

defaultRouter.get('/countScores', (req, res) => {
  getCount(MONGO_COL_SCORES, req, res);
});

defaultRouter.get('/countTrophies', (req, res) => {
  getCount(MONGO_COL_TROPHIES, req, res);
});

defaultRouter.get('/getTrophies', (req, res) => {
  getDocs(MONGO_COL_TROPHIES, req, res);
});

defaultRouter.get('/getScores', (req, res) => {
  getDocs(MONGO_COL_SCORES, req, res);
});

// special routes
defaultRouter.get('/generate/default-trophy-list', genTrophies);

//app.get('/*', (req, res) => {

// Route -> http.put mappings
defaultRouter.put('/insertScore', insertScore);
defaultRouter.put('/updateScore', updateScore);

// Route -> http.delete mappings
defaultRouter.delete('/deleteScore/:scoreId', deleteScore);

// capture all unhandled routes
defaultRouter.get('/*', unhandledRoute);
defaultRouter.put('/*', unhandledRoute);
defaultRouter.delete('/*', unhandledRoute);
defaultRouter.post('/*', unhandledRoute);

// expose router as module
export default defaultRouter;
