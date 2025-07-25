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
 ******/

'use strict'

const Test = require('tapes')(require('tape'))
const Sinon = require('sinon')

const { statusEnum, serviceName } = require('@mojaloop/central-services-shared').HealthCheck.HealthCheckEnums

const MigrationLockModel = require('../../../../src/models/misc/migrationLock')
const Consumer = require('@mojaloop/central-services-stream').Util.Consumer
const Logger = require('../../../../src/shared/logger').logger
const ProxyCache = require('#src/lib/proxyCache')

const {
  getSubServiceHealthBroker,
  getSubServiceHealthDatastore,
  getSubServiceHealthProxyCache
} = require('../../../../src/lib/healthCheck/subServiceHealth.js')

Test('SubServiceHealth test', subServiceHealthTest => {
  let sandbox
  let proxyCacheStub
  subServiceHealthTest.beforeEach(t => {
    sandbox = Sinon.createSandbox()
    sandbox.stub(Consumer, 'getListOfTopics')
    sandbox.stub(Consumer, 'allConnected')
    sandbox.stub(Logger, 'isDebugEnabled').value(true)
    proxyCacheStub = sandbox.stub(ProxyCache, 'getCache')
    t.end()
  })

  subServiceHealthTest.afterEach(t => {
    sandbox.restore()
    t.end()
  })

  subServiceHealthTest.test('getSubServiceHealthBroker', brokerTest => {
    brokerTest.test('broker test passes when there are no topics', async test => {
      // Arrange
      Consumer.getListOfTopics.returns([])
      const expected = { name: serviceName.broker, status: statusEnum.OK }

      // Act
      const result = await getSubServiceHealthBroker()

      // Assert
      test.deepEqual(result, expected, 'getSubServiceHealthBroker should match expected result')
      test.end()
    })

    brokerTest.test('broker test fails when one broker cannot connect', async test => {
      // Arrange
      Consumer.getListOfTopics.returns(['admin1', 'admin2'])
      Consumer.allConnected.throws(new Error('Not connected!'))
      const expected = { name: serviceName.broker, status: statusEnum.DOWN }

      // Act
      const result = await getSubServiceHealthBroker()

      // Assert
      test.deepEqual(result, expected, 'getSubServiceHealthBroker should match expected result')
      test.end()
    })

    brokerTest.test('Passes when it connects', async test => {
      // Arrange
      Consumer.getListOfTopics.returns(['admin1', 'admin2'])
      Consumer.allConnected.returns(Promise.resolve(true))
      const expected = { name: serviceName.broker, status: statusEnum.OK }

      // Act
      const result = await getSubServiceHealthBroker()

      // Assert
      test.deepEqual(result, expected, 'getSubServiceHealthBroker should match expected result')
      test.end()
    })

    brokerTest.test('broker test fails when isConnected returns false for a topic', async test => {
      // Arrange
      Consumer.getListOfTopics.returns(['admin1', 'admin2'])
      // First topic returns true, second returns false
      Consumer.allConnected.withArgs('admin1').returns(Promise.resolve(true))
      Consumer.allConnected.withArgs('admin2').returns(Promise.resolve(false))
      const expected = { name: serviceName.broker, status: statusEnum.DOWN }

      // Act
      const result = await getSubServiceHealthBroker()

      // Assert
      test.deepEqual(result, expected, 'getSubServiceHealthBroker should match expected result when a topic is not connected')
      test.end()
    })

    brokerTest.test('broker test handles isConnected throwing for one topic', async test => {
      // Arrange
      Consumer.getListOfTopics.returns(['topic1', 'topic2'])
      // topic1 resolves true, topic2 throws
      Consumer.allConnected.withArgs('topic1').returns(Promise.resolve(true))
      Consumer.allConnected.withArgs('topic2').throws(new Error('Connection error'))
      const expected = { name: serviceName.broker, status: statusEnum.DOWN }

      // Act
      const result = await getSubServiceHealthBroker()

      // Assert
      test.deepEqual(result, expected, 'getSubServiceHealthBroker should be DOWN if isConnected throws for a topic')
      test.end()
    })

    brokerTest.test('broker test handles getListOfTopics throwing error', async test => {
      // Arrange
      Consumer.getListOfTopics.throws(new Error('Failed to get topics'))
      const expected = { name: serviceName.broker, status: statusEnum.DOWN }

      // Act
      const result = await getSubServiceHealthBroker()

      // Assert
      test.deepEqual(result, expected, 'getSubServiceHealthBroker should be DOWN if getListOfTopics throws')
      test.end()
    })

    brokerTest.end()
  })

  subServiceHealthTest.test('getSubServiceHealthDatastore', datastoreTest => {
    datastoreTest.test('datastore test passes when the database is not migration locked', async test => {
      // Arrange
      sandbox.stub(MigrationLockModel, 'getIsMigrationLocked').returns(false)
      const expected = { name: serviceName.datastore, status: statusEnum.OK }

      // Act
      const result = await getSubServiceHealthDatastore()

      // Assert
      test.deepEqual(result, expected, 'getSubServiceHealthDatastore should match expected result')
      test.ok(MigrationLockModel.getIsMigrationLocked.called)
      test.end()
    })

    datastoreTest.test('datastore test fails when the database is migration locked', async test => {
      // Arrange
      sandbox.stub(MigrationLockModel, 'getIsMigrationLocked').returns(true)
      const expected = { name: serviceName.datastore, status: statusEnum.DOWN }

      // Act
      const result = await getSubServiceHealthDatastore()

      // Assert
      test.deepEqual(result, expected, 'getSubServiceHealthDatastore should match expected result')
      test.ok(MigrationLockModel.getIsMigrationLocked.called)
      test.end()
    })

    datastoreTest.test('datastore test fails when getIsMigrationLocked throws', async test => {
      // Arrange
      sandbox.stub(MigrationLockModel, 'getIsMigrationLocked').throws(new Error('Error connecting to db'))
      const expected = { name: serviceName.datastore, status: statusEnum.DOWN }

      // Act
      const result = await getSubServiceHealthDatastore()

      // Assert
      test.deepEqual(result, expected, 'getSubServiceHealthDatastore should match expected result')
      test.ok(MigrationLockModel.getIsMigrationLocked.called)
      test.end()
    })

    datastoreTest.end()
  })

  subServiceHealthTest.test('getSubServiceHealthProxyCache', proxyCacheTest => {
    proxyCacheTest.test('Reports up when not health', async test => {
      // Arrange
      proxyCacheStub.returns({
        healthCheck: sandbox.stub().returns(Promise.resolve(true))
      })
      const expected = { name: 'proxyCache', status: statusEnum.OK }

      // Act
      const result = await getSubServiceHealthProxyCache()

      // Assert
      test.deepEqual(result, expected, 'getSubServiceHealthBroker should match expected result')
      test.end()
    })

    proxyCacheTest.test('Reports down when not health', async test => {
      // Arrange
      proxyCacheStub.returns({
        healthCheck: sandbox.stub().returns(Promise.resolve(false))
      })
      const expected = { name: 'proxyCache', status: statusEnum.DOWN }

      // Act
      const result = await getSubServiceHealthProxyCache()

      // Assert
      test.deepEqual(result, expected, 'getSubServiceHealthBroker should match expected result')
      test.end()
    })
    proxyCacheTest.end()
  })

  subServiceHealthTest.end()
})
