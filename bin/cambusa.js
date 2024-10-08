#!/usr/bin/env bun

import fs from 'fs';
import { unlinkSync } from 'node:fs';
import path from 'path';
import { createRequire } from 'module';
import readline from 'readline';
import { program } from 'commander';
import { $ } from 'bun';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

program
  .version(version)
  .description('CLI for Cambusa Framework')
  .option(
    '-l, --log-level <level>',
    'Set log level (error, warn, info, verbose, debug, silly)',
    'warn'
  );

/**
 * Helper function to import Cambusa with the specified log level
 * @returns {Promise<Object>} The imported Cambusa instance
 */
async function importCambusa() {
  const appPath = path.join(process.cwd(), 'app.js');
  if (!fs.existsSync(appPath)) {
    console.error('Error: app.js not found in the current directory.');
    console.error(
      'Please ensure you are in the root directory of your Cambusa project.'
    );
    process.exit(1);
  }

  try {
    const cambusa = await import(appPath);
    return cambusa.default;
  } catch (error) {
    console.error('Error importing app.js:', error.message);
    process.exit(1);
  }
}

/**
 * Recursively retrieves all .js script paths within a directory.
 * @param {string} dir - The directory to search.
 * @param {string} baseDir - The base directory for relative paths.
 * @returns {string[]} - An array of script paths relative to baseDir.
 */
function getAllScripts(dir, baseDir) {
  let scripts = [];
  const files = fs.readdirSync(dir, { withFileTypes: true });

  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      scripts = scripts.concat(getAllScripts(fullPath, baseDir));
    } else if (file.isFile() && file.name.endsWith('.js')) {
      scripts.push(path.relative(baseDir, fullPath).replace(/\.js$/, ''));
    }
  }

  return scripts;
}

// Command to generate a new model
program
  .command('models:generate <name>')
  .description('Generate a new model')
  .action((name) => {
    const modelTemplate = `
    export default {
      columns: {
        // Define your columns here
      },
      relations: {
        // Define your relations here
      },
    };
    `;
    const fileName = `${name}.js`;
    const filePath = path.join(process.cwd(), 'api', 'models', fileName);

    fs.writeFileSync(filePath, modelTemplate.trim());
    console.log(`Model ${name} created at ${filePath}`);
  });

// Command to list all models
program
  .command('models:list')
  .description('List all models')
  .action(() => {
    const modelsDir = path.join(process.cwd(), 'api', 'models');
    if (!fs.existsSync(modelsDir)) {
      console.error('Models directory does not exist.');
      process.exit(1);
    }

    const models = fs
      .readdirSync(modelsDir)
      .filter((file) => file.endsWith('.js'))
      .map((file) => path.basename(file, '.js'));

    if (models.length === 0) {
      console.log('No models found.');
      return;
    }

    console.log('Available models:');
    models.forEach((model) => console.log(`- ${model}`));
  });

// Command to start the Cambusa server
program
  .command('lift')
  .description('Start the Cambusa server')
  .action(async () => {
    try {
      const cambusa = await importCambusa();
      await cambusa.lift();
    } catch (error) {
      console.error('Failed to start Cambusa server:', error);
      process.exit(1);
    }
  });

// Command to list all registered routes
program
  .command('routes:list')
  .description('List all registered routes')
  .action(async () => {
    try {
      const cambusa = await importCambusa();
      const routes = cambusa.app.routes;
      console.log('Registered routes:');
      routes.forEach((route) => {
        console.log(`${route.method} ${route.path}`);
      });
    } catch (error) {
      console.error('Failed to list routes:', error);
      process.exit(1);
    }
  });

// Command to generate a new controller
program
  .command('controllers:generate <name>')
  .description('Generate a new controller')
  .action((name) => {
    try {
      // Define the base directory for controllers
      const baseDir = path.join(process.cwd(), 'api', 'controllers');

      // Normalize the name to use forward slashes and remove leading/trailing slashes
      const normalizedName = name.replace(/\\/g, '/').replace(/^\/|\/$/g, '');

      // Determine if the user provided the .js extension
      const hasJsExtension = normalizedName.endsWith('.js');

      // Remove the .js extension if present to prevent double extensions
      const nameWithoutExt = hasJsExtension
        ? normalizedName.slice(0, -3)
        : normalizedName;

      // Construct the full file path
      const filePath = path.join(baseDir, `${nameWithoutExt}.js`);

      // Extract the directory path (excluding the file name)
      const dirPath = path.dirname(filePath);

      // Create the directory structure recursively if it doesn't exist
      fs.mkdirSync(dirPath, { recursive: true });

      // Define the controller template
      const controllerTemplate = `
      export default async function ({ error }) {
        try {
          // TODO: Implement your controller logic here
        } catch (err) {
          cambusa.log.error(err, 'Controller Error:');
          error(500, 'Internal Server Error');
        }
      };
      `.trimStart();

      // Check if the file already exists to prevent overwriting
      if (fs.existsSync(filePath)) {
        console.error(`Error: Controller '${filePath}' already exists.`);
        process.exit(1);
      }

      // Write the controller file
      fs.writeFileSync(filePath, controllerTemplate, { encoding: 'utf8' });

      console.log(`✅ Controller created at ${filePath}`);
    } catch (error) {
      console.error(
        '❌ An error occurred while generating the controller:',
        error.message
      );
      process.exit(1);
    }
  });

// Command to synchronize database schema
program
  .command('db:sync')
  .description('Synchronize database schema')
  .action(async () => {
    try {
      const cambusa = await importCambusa();
      if (cambusa && cambusa.db) {
        await cambusa.db.synchronize();
        console.log('Database schema synchronized successfully.');
      } else {
        console.error(
          'Cambusa instance or database connection not found. Please check your app.js file.'
        );
      }
    } catch (error) {
      console.error('Failed to synchronize database schema:', error);
    }
  });

// Command to generate a new migration based on entity changes
program
  .command('migrations:generate <name>')
  .description('Generate a new migration based on entity changes')
  .action(async (name) => {
    try {
      const cambusa = await importCambusa();
      if (!cambusa || !cambusa.db) {
        throw new Error(
          'Failed to initialize Cambusa instance or database connection.'
        );
      }

      const dataSource = cambusa.db;
      if (!dataSource.isInitialized) {
        await dataSource.initialize();
      }

      const migrationName = `${Date.now()}-${name}`;
      const migrationPath = path.join(process.cwd(), 'migrations');

      // Ensure the migrations directory exists
      await $`mkdir -p ${migrationPath}`;

      const tempConfigPath = path.join(
        process.cwd(),
        'temp-typeorm-config.cjs'
      );
      const configContent = `
      const { DataSource } = require("typeorm");
      module.exports = new DataSource(${JSON.stringify(
        dataSource.options,
        (key, value) => {
          if (key === 'entities') {
            return value; // This will keep the entities as a JavaScript array
          }
          return value;
        },
        2
      )
        .replace('"entities": [', '"entities": [\n')
        .replace(/\\"/g, '"')});`;

      await Bun.write(tempConfigPath, configContent);

      try {
        // Run TypeORM CLI command to generate migration
        const fullMigrationPath = path.join(migrationPath, migrationName);
        const result =
          await $`bunx typeorm migration:generate -d ${tempConfigPath} ${fullMigrationPath}`;

        if (
          result.stdout.includes('No changes in database schema were found')
        ) {
          console.log(
            'No changes in database schema were detected. No new migration was generated.'
          );
          console.log(
            "If you want to create an empty migration, use the 'migrations:create' command instead."
          );
        } else {
          console.log('Migration generation output:', result.stdout.toString());
          console.log(`Migration ${migrationName} has been generated.`);
        }
      } catch (error) {
        if (
          error.stderr &&
          error.stderr.includes('No changes in database schema were found')
        ) {
          console.log(
            'No changes in database schema were detected. No new migration was generated.'
          );
          console.log(
            "If you want to create an empty migration, use the 'migrations:create' command instead."
          );
        } else {
          throw error;
        }
      } finally {
        // Remove the temporary config file
        unlinkSync(tempConfigPath);
      }
    } catch (error) {
      console.error('Failed to generate migration:', error.message);
    }
  });

// Command to run pending migrations
program
  .command('migrations:run')
  .description('Run pending migrations')
  .action(async () => {
    try {
      const cambusa = await importCambusa();
      if (!cambusa || !cambusa.db) {
        throw new Error(
          'Failed to initialize Cambusa instance or database connection.'
        );
      }

      const dataSource = cambusa.db;
      if (!dataSource.isInitialized) {
        await dataSource.initialize();
      }

      console.log('Running pending migrations...');
      const migrations = await dataSource.runMigrations();

      if (migrations.length === 0) {
        console.log('No pending migrations to run.');
      } else {
        console.log(`Successfully ran ${migrations.length} migration(s):`);
        migrations.forEach((migration) => {
          console.log(`- ${migration.name}`);
        });
      }
    } catch (error) {
      console.error('Failed to run migrations:', error.message);
    } finally {
      if (cambusa && cambusa.db) {
        await cambusa.db.destroy();
      }
    }
  });

// Command to create a new empty migration
program
  .command('migrations:create <name>')
  .description('Create a new empty migration')
  .action(async (name) => {
    try {
      const cambusa = await importCambusa();
      if (!cambusa || !cambusa.db) {
        throw new Error(
          'Failed to initialize Cambusa instance or database connection.'
        );
      }

      const dataSource = cambusa.db;
      if (!dataSource.isInitialized) {
        await dataSource.initialize();
      }

      const migrationName = `${Date.now()}-${name}`;
      const migrationPath = path.join(process.cwd(), 'migrations');

      // Ensure the migrations directory exists
      await $`mkdir -p ${migrationPath}`;

      const fullMigrationPath = path.join(migrationPath, migrationName);
      const result =
        await $`bunx typeorm migration:create ${fullMigrationPath}`;

      console.log('Migration creation output:', result.stdout.toString());
      console.log(`Empty migration ${migrationName} has been created.`);
    } catch (error) {
      console.error('Failed to create migration:', error.message);
    }
  });

// Command to start an interactive REPL session with Cambusa loaded
program
  .command('repl')
  .description('Start an interactive REPL session with Cambusa loaded')
  .action(async () => {
    try {
      const cambusa = await importCambusa();
      if (cambusa) {
        console.log('Starting Cambusa REPL session...');
        console.log('Cambusa instance is available as "cambusa"');
        console.log('Type "exit" to exit the session');

        const customCommands = {
          routes: () => {
            const routes = cambusa.app.routes;
            console.log('Registered routes:');
            routes.forEach((route) => {
              console.log(`${route.method} ${route.path}`);
            });
          },
          models: () => {
            const models = Object.keys(cambusa.models);
            console.log('Available models:');
            models.forEach((model) => console.log(`- ${model}`));
          },
          help: () => {
            console.log('Available commands:');
            console.log('  routes - List all registered routes');
            console.log('  models - List all available models');
            console.log('  help   - Show this help message');
            console.log('  exit   - Exit the REPL session');
          },
        };

        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
          prompt: 'cambusa> ',
        });

        rl.prompt();

        rl.on('line', async (line) => {
          const input = line.trim();
          if (input.toLowerCase() === 'exit') {
            console.log('Exiting Cambusa REPL session...');
            rl.close();
            return;
          }
          if (customCommands[input]) {
            customCommands[input]();
          } else {
            try {
              // Use Function constructor to create a function with 'cambusa' in its scope
              const result = await new Function(
                'cambusa',
                `return (async () => { return ${input} })()`
              ).call(null, cambusa);
              console.log(result);
            } catch (error) {
              console.error('Error:', error.message);
            }
          }
          rl.prompt();
        }).on('close', () => {
          process.exit(0);
        });
      } else {
        console.error('Failed to initialize Cambusa instance.');
      }
    } catch (error) {
      console.error('Failed to start Cambusa REPL session:', error);
    }
  });

// Command to run a script from the ./scripts directory or its subdirectories with optional arguments
program
  .command('run <scriptPath> [args...]')
  .description(
    'Run a script from the ./scripts directory or its subdirectories with optional arguments'
  )
  .action(async (scriptPath, args) => {
    try {
      const cambusa = await importCambusa();

      const scriptsDir = path.resolve(process.cwd(), 'scripts');
      const fullScriptPath = path.resolve(scriptsDir, `${scriptPath}.js`);

      // Ensure the script is within the scripts directory
      if (!fullScriptPath.startsWith(scriptsDir)) {
        console.error(
          'Invalid script path. Scripts must be within the ./scripts directory.'
        );
        process.exit(1);
      }

      if (!fs.existsSync(fullScriptPath)) {
        console.error(`Script '${scriptPath}' not found in scripts directory.`);
        process.exit(1);
      }

      const scriptModule = await import(fullScriptPath);

      if (typeof scriptModule.default !== 'function') {
        console.error(
          `Script '${scriptPath}' does not export a default function.`
        );
        process.exit(1);
      }

      // Execute the script, passing the cambusa instance and additional arguments
      await scriptModule.default(cambusa, args);

      console.log(`Script '${scriptPath}' executed successfully.`);
    } catch (error) {
      console.error(`Failed to run script '${scriptPath}':`, error);
      process.exit(1);
    }
  });

// Command to list all available scripts in the ./scripts directory and its subdirectories
program
  .command('scripts:list')
  .description(
    'List all available scripts in the ./scripts directory and its subdirectories'
  )
  .action(() => {
    try {
      const scriptsDir = path.resolve(process.cwd(), 'scripts');
      if (!fs.existsSync(scriptsDir)) {
        console.error('Scripts directory does not exist.');
        process.exit(1);
      }

      const scripts = getAllScripts(scriptsDir, scriptsDir);

      if (scripts.length === 0) {
        console.log('No scripts found in the scripts directory.');
        return;
      }

      console.log('Available Scripts:');
      scripts.forEach((script) => console.log(`- ${script}`));
    } catch (error) {
      console.error('Failed to list scripts:', error);
      process.exit(1);
    }
  });

// Add a new command to initialize a Cambusa project
program
  .command('init [projectName]')
  .description('Initialize a new Cambusa project')
  .action((projectName = 'cambusa-project') => {
    const targetDir = path.join(process.cwd(), projectName);
    if (fs.existsSync(targetDir)) {
      console.error(`Error: Directory '${projectName}' already exists.`);
      process.exit(1);
    }

    fs.mkdirSync(targetDir);

    // Resolve the template directory path relative to the installed package
    let templateDir;
    try {
      const packagePath = require.resolve('@cambusa/cli/package.json');
      templateDir = path.join(path.dirname(packagePath), 'template');
    } catch (error) {
      console.error('Error finding @cambusa/cli package:', error.message);
      process.exit(1);
    }

    console.log(`Template directory: ${templateDir}`);

    if (!fs.existsSync(templateDir)) {
      console.error(`Error: Template directory not found at ${templateDir}`);
      console.error('Please ensure you have installed @cambusa/cli correctly.');
      process.exit(1);
    }

    try {
      fs.cpSync(templateDir, targetDir, { recursive: true });
      console.log(`Successfully copied template to ${targetDir}`);
    } catch (error) {
      console.error('Error copying template files:', error.message);
      process.exit(1);
    }

    // Generate package.json
    const packageJson = {
      name: projectName,
      version: '0.1.0',
      private: true,
      type: 'module',
      scripts: {
        start: 'cambusa lift',
        dev: 'cambusa lift',
        test: 'bun test',
      },
      dependencies: {
        '@cambusa/core': '^0.9.1',
      },
      devDependencies: {
        bun: '>= 1.1.28',
        '@cambusa/cli': `^${version}`,
      },
    };

    fs.writeFileSync(
      path.join(targetDir, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );

    console.log(`Cambusa project initialized in '${projectName}' directory.`);
    console.log('To get started:');
    console.log(`  cd ${projectName}`);
    console.log('  bun install');
    console.log('  bun run dev');
  });

// Parse command line arguments
program.parse(process.argv);
