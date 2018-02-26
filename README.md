# Type definitions for [PokeAPI](https://github.com/PokeAPI/pokeapi) and [pokedex-promise-v2](https://github.com/PokeAPI/pokedex-promise-v2)

## Installation

```bash
npm install --save mudkipme/pokeapi-v2-typescript#<commit hash>
```

## Usage

```typescript
import Pokedex from "pokedex-promise-v2";

(async () => {
    const pokedex = new Pokedex();
    const species = await pokedex.getPokemonSpeciesByName("mudkip");
    const variety = species.varieties.find((speciesVariety) => speciesVariety.is_default);
    if (variety) {
        const pokemon = await pokedex.resource(variety.pokemon.url);
        const types = await Promise.all(pokemon.types.map((pokemonType) => pokedex.resource(pokemonType.type.url)));
        console.log(types.map((type) => type.names));
    }
})();
```

## Generation (no pun intended)

```bash
npm run build
```

This is a project to generate full type definitions for the RESTful API of PokeAPI. You can run the generator with the command above.

The generator is based on the documents of `PokeAPI` and `pokedex-promise-v2`. However, due to several errors, mismatches and nullable attributes in PokeAPI documents and responses. The generated definitions need to be revised and corrected by human. The generator may also find some mismatches and output to `stderr`.

## License

[MIT](LICENSE)