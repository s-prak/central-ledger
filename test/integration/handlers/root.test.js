/*****
 License
 --------------
 Copyright © 2020-2025 Mojaloop Foundation
 The Mojaloop files are made available by the Mojaloop Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

 Contributors
 --------------
 This is the official list of the Mojaloop project contributors for this file.
 Names of the original copyright holders (individuals or organizations)
 should be listed with a '*' in the first column. People who have
 contributed from an organization can be listed under the organization
 that actually holds the copyright for their contributions (see the
 Mojaloop Foundation for an example). Those individuals should have
 their names indented and be marked with a '-'. Email address can be added
 optionally within square brackets <email>.

 * Mojaloop Foundation
 - Name Surname <name.surname@mojaloop.io>

 * Lewis Daly <lewis@vesselstech.com>
 --------------
 **********/

'use strict'

const Test = require('tape')
const Joi = require('joi')
const Logger = require('@mojaloop/central-services-logger')
const Db = require('../../../src/lib/db')

const Config = require('../../../src/lib/config')
const ProxyCache = require('../../../src/lib/proxyCache')
const Consumer = require('@mojaloop/central-services-stream').Util.Consumer
// const Producer = require('@mojaloop/central-services-stream').Util.Producer
const rootApiHandler = require('../../../src/api/root/handler')
const {
  createRequest,
  unwrapResponse,
  waitFor
} = require('../../util/helpers')

const Handlers = {
  index: require('../../../src/handlers/register'),
  positions: require('../../../src/handlers/positions/handler'),
  transfers: require('../../../src/handlers/transfers/handler')
}

const debug = false

Test('Root handler test', async handlersTest => {
  const startTime = new Date()
  await handlersTest.test('registerAllHandlers should', async registerAllHandlers => {
    await registerAllHandlers.test('setup handlers', async (test) => {
      await Db.connect(Config.DATABASE)
      await ProxyCache.connect()
      await Handlers.transfers.registerPrepareHandler()
      await Handlers.positions.registerPositionHandler()
      await Handlers.transfers.registerFulfilHandler()

      const isReady = async () => {
        const consumerTopics = Consumer.getListOfTopics()
        await Promise.all(consumerTopics.map(t => Consumer.allConnected(t)))
      }
      try {
        await waitFor(isReady, 'Consumers to be up', 5, 3)
      } catch (err) {
        test.fail('Consumers were not ready in time')
      }

      test.pass('done')
      test.end()
    })

    await registerAllHandlers.end()
  })

  /* Health Check Tests */

  await handlersTest.test('healthCheck should', async healthCheckTest => {
    await healthCheckTest.test('get the basic health of the service', async (test) => {
      // Arrange
      const expectedSchema = Joi.compile({
        status: Joi.string().valid('OK').required(),
        uptime: Joi.number().required(),
        startTime: Joi.date().iso().required(),
        versionNumber: Joi.string().required(),
        services: Joi.array().required()
      })
      const expectedStatus = 200
      const expectedServices = [
        { name: 'datastore', status: 'OK' },
        { name: 'broker', status: 'OK' },
        { name: 'proxyCache', status: 'OK' }
      ]

      // Act
      const {
        responseBody,
        responseCode
      } = await unwrapResponse((reply) => rootApiHandler.getHealth(createRequest({}), reply))

      // Assert
      const validationResult = Joi.attempt(responseBody, expectedSchema) // We use Joi to validate the results as they rely on timestamps that are variable
      test.equal(validationResult.error, undefined, 'The response matches the validation schema')
      test.deepEqual(responseCode, expectedStatus, 'The response code matches')
      test.deepEqual(responseBody.services, expectedServices, 'The sub-services are correct')
      test.end()
    })

    healthCheckTest.end()
  })

  await handlersTest.test('teardown', async (assert) => {
    try {
      await Db.disconnect()
      assert.pass('database connection closed')
      await ProxyCache.disconnect()
      // TODO: Replace this with KafkaHelper.topics
      const topics = [
        'topic-transfer-prepare',
        'topic-transfer-position',
        'topic-transfer-fulfil',
        'topic-notification-event'
      ]

      // TODO: Story to investigate as to why the Producers failed reconnection on the ./transfers/handlers.test.js - https://github.com/mojaloop/project/issues/3067
      // TODO: Clean this up once the above issue has been resolved.
      // for (const topic of topics) {
      //   try {
      //     await Producer.getProducer(topic).disconnect()
      //     assert.pass(`producer to ${topic} disconnected`)
      //   } catch (err) {
      //     assert.pass(err.message)
      //   }
      // }

      // TODO: Replace this with await KafkaHelper.consumers.disconnect() once the above issue is resolved.
      for (const topic of topics) {
        try {
          await Consumer.getConsumer(topic).disconnect()
          assert.pass(`consumer to ${topic} disconnected`)
        } catch (err) {
          assert.pass(err.message)
        }
      }

      if (debug) {
        const elapsedTime = Math.round(((new Date()) - startTime) / 100) / 10
        console.log(`root.test.js finished in (${elapsedTime}s)`)
      }
      assert.end()
    } catch (err) {
      Logger.error(`teardown failed with error - ${err}`)
      assert.fail()
      assert.end()
    }
  })

  handlersTest.end()
})
