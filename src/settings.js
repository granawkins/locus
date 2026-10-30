import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';

const template = new URL('../templates/settings.template.json', import.meta.url);

function readObject(path) {
  const value = JSON.parse(readFileSync(path, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('expected an object');
  return value;
}

function migrateSettings(state) {
  const path = join(state, 'settings.json');
  const legacy = join(state, 'config.json');
  if (existsSync(path) || !existsSync(legacy)) return;
  try {
    const settings = readObject(legacy);
    if ('systemPrompt' in settings) {
      settings.customInstructions ??= settings.systemPrompt;
      delete settings.systemPrompt;
    }
    writeFileSync(path, JSON.stringify(settings, null, 2) + '\n', { flag: 'wx' });
  } catch (error) {
    throw Error(`could not migrate .locus/config.json: ${error.message}`);
  }
}

export function initialize(directory) {
  const state = join(directory, '.locus');
  mkdirSync(state, { recursive: true });
  migrateSettings(state);
  const path = join(state, 'settings.json');
  if (!existsSync(path)) writeFileSync(path, readFileSync(template), { flag: 'wx' });
}

export function profileArguments(directory) {
  const state = join(directory, '.locus');
  migrateSettings(state);
  const path = join(state, 'settings.json');
  const args = [];
  try {
    const profile = existsSync(path) ? readObject(path) : {};
    for (const [key, value] of Object.entries(profile)) {
      if (['model', 'thinking', 'customInstructions'].includes(key)) {
        if (typeof value !== 'string') throw Error(`${key} must be a string`);
        if (value.trim()) args.push(key === 'customInstructions' ? '--append-system-prompt' : `--${key}`, value);
      } else if (['tools', 'skills', 'preloadSkills'].includes(key)) {
        if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !item.trim())) {
          throw Error(`${key} must be an array of nonempty strings`);
        }
        if (key === 'tools') {
          if (value.length) args.push('--tools', value.join(','));
        } else for (const entry of value) {
          const skill = resolve(directory, entry.startsWith('~/') ? join(homedir(), entry.slice(2)) : entry);
          args.push('--skill', skill);
          if (key === 'preloadSkills') {
            args.push('--append-system-prompt', `Preloaded skill: ${skill}\nResolve its relative references from ${dirname(skill)}.\n\n${readFileSync(skill, 'utf8')}`);
          }
        }
      } else throw Error(`unknown field: ${key}`);
    }
  } catch (error) {
    throw Error(`invalid .locus/settings.json: ${error.message}`);
  }
  return args;
}
