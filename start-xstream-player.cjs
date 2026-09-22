const path = require('node:path');

const projectDirectory = __dirname;
process.chdir(projectDirectory);
process.env.XSTREAM_CATEGORY_PREFIXES = 'NL,EN,UK,US,USA,BE,ALL';
process.argv = [
    process.execPath,
    require.resolve('next/dist/bin/next'),
    'start',
    '--hostname',
    '127.0.0.1',
    '--port',
    '3000',
];

require('next/dist/bin/next');
