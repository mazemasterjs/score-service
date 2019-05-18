# score-service

REST API exposing basic CRUD operations for Score data

## Details

-   MazeMasterJS services are RESTful APIs built in NodeJS with express
-   Every service includes a service.json file that lists endpoints, and possible arguments (with type)
-   See [/service.json](https://github.com/mazemasterjs/score-service/blob/development/service.json) for complete list of endpoints and arguments.

## Notes

-   This service is hooked to OpenShift - when a PR against master is completed, the CD pipeline kicks in and OpenShift pulls the repo, creates a new container image, and attempts to deploy it to the cluster. Unless the build / deploy fails, changes will be live within a minute of the PR being completed.

## Change Log

### v1.0.0

-   get: '/get/count' - Returns count of all score documents
-   get: '/get' - gets all scores in database (paging enabled internally - could take awhile - use with caution!)
-   get: '/service' - returns the service document
-   put: '/insert' - Insert a score into the database (score passed as json document body)
-   put: '/update' - Update a score in the database (updated score passed as json document body)
-   delete: '/delete/:scoreId - Delete a single score with a matching scoreId

## TODO

-   Need to add paging parameters to /get
-   Need to add sorting parameters to /get
