/* eslint-disable no-unused-expressions */
/* eslint-disable camelcase */
/* eslint-disable node/no-unpublished-require */
'use strict';

const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);
const {expect} = chai;
const fs = require('fs');
const sinon = require('sinon');

const upsertObject = require('../lib/actions/upsertObject');
const lookupObject = require('../lib/actions/lookupObjectByFields');
const getObjectsPolling = require('../lib/triggers/getObjectsPolling');
const verifyCredentials = require('../verifyCredentials');

function randomString() {
  return  Math.random().toString(36).substring(2, 15);
}

describe('Integration Test', function () {
  let resourceServerUrl;
  let username;
  let password;
  let cfg;
  let emitter;

  this.timeout(30000);

  before(function () {
    if (fs.existsSync('.env')) {
      require('dotenv').config();
    }

    resourceServerUrl = process.env.BC_RESOURCE_SERVER_URL;
    username = process.env.BC_USERNAME;
    password = process.env.BC_WEB_SERVICE_ACCESS_KEY;
  });

  beforeEach(function () {
    cfg = {
      resourceServerUrl,
      auth: {
        type: 'Basic Auth',
        basic: {
          username,
          password
        }
      }
    };

    emitter = {
      emit: sinon.spy()
    };
  });

  describe('Trigger Tests', function () {
    it('GetObjectsPolling', async function () {
      cfg.objectType = 'CustomerCardService';

      const testCall = getObjectsPolling.process.call(emitter, {}, cfg);
      expect(testCall).to.be.rejectedWith(Error, 'No delta link provided.  Unable to record snapshot.');
      try{
        await testCall;
        // eslint-disable-next-line no-empty
      } catch (e) {}

      const emittedObjectsAfterCallOne = emitter.emit.withArgs('data').callCount;
      expect(emittedObjectsAfterCallOne).to.be.above(1);
    });
  });

  describe('List Objects Tests', function () {
    [upsertObject, getObjectsPolling, lookupObject].forEach(function (triggerOrAction) {
      it('List Objects', async function () {
        const result = await triggerOrAction.getObjects(cfg);
        const objects = Object.keys(result);
        expect(objects).to.include('CustomerCardService');
      });
    });
  });

  describe('Metadata Tests', function () {
    it('Build In Metadata', async function () {
      cfg.objectType = 'CustomerCardService';
      const metadata = await upsertObject.getMetaModel(cfg);

      expect(metadata.in).to.deep.equal(metadata.out);
      expect(metadata.in.type).to.equal('object');
      expect(metadata.in.required).to.be.true;

      const properties = metadata.in.properties;

      expect(properties.No.required).to.be.false;

      // A full set of assertions are in the unit tests
    });
  });

  describe('Verify Credential Tests', function () {
    it('Success Case', async function () {
      const result = await verifyCredentials(cfg);
      expect(result).to.be.true;
    });
  });

  describe('Action Tests', function () {
    it('Upsert - Insert, Update and Lookup', async function () {
      cfg.objectType = 'CustomerCardService';
      const insertName = `Automated Test ${randomString()}`;
      const insertMsg = {
        body: {
          Name: insertName
        }
      };

      await upsertObject.process.call(emitter, insertMsg, cfg, {});

      expect(emitter.emit.withArgs('data').callCount).to.be.equal(1);
      const insertResult = emitter.emit.getCall(0).args[1];
      expect(insertResult.body.No).to.be.a('string');
      expect(insertResult.body.No.length).to.be.above(0);
      expect(insertResult.body.Name).to.be.equal(insertName);

      const providedNo = insertResult.body.No;

      const updateName = `${insertName} - Update`;
      const updateMsg = {
        body: {
          Name: updateName,
          No: providedNo
        }
      };

      await upsertObject.process.call(emitter, updateMsg, cfg, {});

      expect(emitter.emit.withArgs('data').callCount).to.be.equal(1);
      const upsertResult = emitter.emit.getCall(0).args[1];
      expect(upsertResult.body.No).to.be.equal(providedNo);
      expect(upsertResult.body.No.length).to.be.above(0);
      expect(upsertResult.body.Name).to.be.equal(updateName);
    });

    xdescribe('Lookup Object Tests', function () {
      it('Success Lookup String', async function () {
        cfg.objectType = 'People';
        cfg.fieldName = 'UserName';
        cfg.allowEmptyCriteria = true;
        cfg.castToString = true;

        const personUserName = process.env.CONTACT_TO_LOOKUP_ID;
        const expectedPersonFirstName = process.env.CONTACT_TO_LOOKUP_FIRST_NAME;

        const msg = {
          body: {
            UserName: personUserName
          }
        };

        await lookupObject.process.call(emitter, msg, cfg);

        expect(emitter.emit.withArgs('data').callCount).to.be.equal(1);
        const result = emitter.emit.getCall(0).args[1];
        expect(result.body.UserName).to.be.equal(personUserName);
        expect(result.body.FirstName).to.be.equal(expectedPersonFirstName);
      });
    });
  });
});
