#!/usr/bin/env node
import { main } from '../src/cli.js';

try {
  main();
} catch (error) {
  console.error(`locus: ${error.message}`);
  process.exitCode = 1;
}
