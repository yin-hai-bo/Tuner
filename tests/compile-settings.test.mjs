import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

test('builds use Babel syntax lowering without the broken SWC runtime helper path', () => {
  const project = JSON.parse(readFileSync(new URL('../project.config.json', import.meta.url), 'utf8'))
  const privatePath = new URL('../project.private.config.json', import.meta.url)
  const privateProject = existsSync(privatePath) ? JSON.parse(readFileSync(privatePath, 'utf8')) : {}
  for (const settings of [project.setting, { ...project.setting, ...privateProject.setting }]) {
    assert.equal(settings.disableSWC, true, 'Use Babel to avoid missing transitive SWC runtime helpers')
    assert.equal(settings.es6, true, 'Device builds must enable JavaScript compatibility transforms')
    assert.equal(settings.enhance, true, 'TypeScript stripping alone leaves modern syntax in the output')
    assert.deepEqual(settings.babelSetting.ignore, [])
    assert.deepEqual(settings.babelSetting.disablePlugins, [])
  }
})
