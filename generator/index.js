const axios = require('axios');
const MarkdownIt = require('markdown-it');
const cheerio = require('cheerio');
const TurndownService = require('turndown');
const changeCase = require('change-case');
const fs = require('fs');

const md = new MarkdownIt({
    html: true
});
const turndownService = new TurndownService();
const apiResourceNames = ['APIResource', 'APIResourceList', 'NamedAPIResource', 'NamedAPIResourceList'];

function formatDataType(dataType) {
    dataType = dataType.split('é').join('e');
    dataType = dataType.split('integer').join('number');
    dataType = dataType.replace(/\s+\(([\w\s]+)\)/, '<$1>');
    dataType = dataType.replace(/^list\s+(.*)$/, '$1[]');
    dataType = dataType.split(' ').join('');
    if (apiResourceNames.includes(dataType)) {
        dataType = dataType + '<T>';
    }
    if (dataType.substr(-2) === '[]' && apiResourceNames.includes(dataType.substr(0, dataType.length - 2))) {
        dataType = dataType.substr(0, dataType.length - 2) + '<T>[]';
    }
    return dataType;
}

async function parse() {
    const { data } = await axios.get('https://raw.githubusercontent.com/PokeAPI/pokeapi/master/pokemon_v2/README.md', { responseType: 'text'});

    const html = md.render(data);
    const $ = cheerio.load(html);

    const result = [];

    $('table').each((_, ele) => {
        let name = $(ele).prev('h4').text();
        if (!name) {
            return;
        }
        name = name.split(' ').join('');
        if (apiResourceNames.includes(name)) {
            name = name + '<T>';
        }

        // find attributes
        const attributes = [];
        $(ele).find('tr').each((i, tr) => {
            if (i === 0) {
                return;
            }
            let name = $(tr).find('td:first-of-type').text();
            name = name.split(' ').join('_');
            let description = $(tr).find('td:nth-of-type(2)').html();
            description = turndownService.turndown(description);
            let dataType = $(tr).find('td:nth-of-type(3)').text();
            dataType = formatDataType(dataType);
            attributes.push({
                name,
                description,
                dataType,
                nullable: false
            });
        });

        // find description
        let description = $(ele).prev('h4').prev('h6').prev('pre').prev('h6').prev('h3').prev('p').html();
        if (description) {
            description = turndownService.turndown(description);
        }

        result.push({ name, description, attributes });
    });

    // find nullable (based on examples, not accurate)
    const findNullable = (name, data, modelName) => {
        const model = result.find(model => (model.name === name || model.name === name.replace(/\<\w+\>/, '<T>')));
        if (!model) {
            console.error(`Cannot find model ${name} for ${JSON.stringify(data)}, in root api for ${modelName}`);
            return;
        }
        Object.keys(data).forEach(key => {
            const attribute = model.attributes.find(attribute => attribute.name === key);
            if (!attribute) {
                console.error(`Cannot find attribute ${key} in ${name}, in root api for ${modelName}`);
                return;
            }
            if (data[key] === null && typeof data[key] === 'object') {
                attribute.nullable = true;
            } else if (typeof data[key] === 'object' && !Array.isArray(data[key])) {
                findNullable(attribute.dataType, data[key], modelName);
            } else if (Array.isArray(data[key]) && attribute.dataType.substr(-2) === '[]') {
                data[key].forEach(item => {
                    if (typeof item === 'string' && attribute.dataType === 'string[]') {
                        return;
                    }
                    if (typeof item === 'number' && attribute.dataType === 'number[]') {
                        return;
                    }
                    findNullable(attribute.dataType.substr(0, attribute.dataType.length - 2), item, modelName);
                });
            }
        });
    };

    $('table').each((_, ele) => {
        let name = $(ele).prev('h4').text();
        if (!name) {
            return;
        }
        let example = $(ele).prev('h4').prev('h6').prev('pre').text();
        if (example) {
            example = JSON.parse(example);
            name = name.split(' ').join('');
            findNullable(name, example, name);
        }
    });

    return result;
}

function renderInterface(models) {
    return models.map(model =>
`${model.description ? `/** ${model.description} */\n` : ''}interface ${model.name} {
${model.attributes.map(attribute => 
`    ${attribute.description ? `/** ${attribute.description} */\n    ` : ''}${attribute.name}: ${attribute.dataType}${attribute.nullable ? ' | null' : ''};`).join('\n')}
}`).join('\n\n');
}

module.exports = async function() {
    const models = await parse();
    const interfaces = renderInterface(models);

    const [endpoints, rootEndpoints] = await Promise.all([
        axios.get('https://raw.githubusercontent.com/PokeAPI/pokedex-promise-v2/master/src/endpoints.json'),
        axios.get('https://raw.githubusercontent.com/PokeAPI/pokedex-promise-v2/master/src/rootEndpoints.json')
    ]);

    const result = 
`// Type definitions for pokedex-promise-v2 v3.x
// Project: https://github.com/PokeAPI/pokedex-promise-v2
// Definitions by: Mudkip <https://github.com/mudkipme/>
// Definitions: https://github.com/mudkipme/pokeapi-v2-typescript

declare module "pokedex-promise-v2" {
    interface APIResourceURL<T> extends String {}

    namespace PokeAPI {
${interfaces.split('\n').map(line => line.trim() ? '        ' + line : '').join('\n')}
    }

    interface PokeAPIOptions {
        protocol?: "https" | "http";
        hostName?: string;
        versionPath?: string;
        cacheLimit?: number;
        timeout?: number;
    }

    interface RootEndPointInterval {
        limit?: number;
        offset?: number;
    }

    interface EndPointResult {
${models.filter(model => model.description && model.name.indexOf('APIResource') === -1).map(model => 
`        "${changeCase.paramCase(model.name)}": APIResourceURL<PokeAPI.NamedAPIResourceList<PokeAPI.${model.name}>>;`
).join('\n')}
    }

    class PokeAPI {
        constructor(options?: PokeAPIOptions);
        resource(path: string): Promise<any>;
        resource(paths: string[]): Promise<any[]>;
        resource<T>(path: APIResourceURL<T>): Promise<T>;
        resource<T>(paths: APIResourceURL<T>[]): Promise<T[]>;
${endpoints.data.map(endpoint =>
`        ${endpoint[0]}(${endpoint[0].match(/ById$/) ? 'id: number' : 'nameOrId: string | number'}): Promise<PokeAPI.${changeCase.pascalCase(endpoint[1])}>;
        ${endpoint[0]}(${endpoint[0].match(/ById$/) ? 'ids: number[]' : 'nameOrIds: Array<string | number>'}): Promise<PokeAPI.${changeCase.pascalCase(endpoint[1])}[]>;`
).join('\n')}
${rootEndpoints.data.map(endpoint =>
`        ${endpoint[0]}(interval?: RootEndPointInterval): Promise<${endpoint[1] ? `PokeAPI.NamedAPIResourceList<PokeAPI.${ changeCase.pascalCase(endpoint[1].substr(0, endpoint[1].length - 1))}>` : 'EndPointResult'}>;`
).join('\n')}
    }

    export = PokeAPI;
}`;

    return result;
}

if (module.parent === null) {
    module.exports().then((result) => {
        fs.writeFileSync('index.generated.d.ts', result, { encoding: 'utf8' });
    });
}