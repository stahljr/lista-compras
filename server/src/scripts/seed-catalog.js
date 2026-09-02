/**
 * Popula o catalogo com o que se compra de verdade, para o app abrir cheio:
 * as categorias ja tem produto, a busca responde do cache e a comparacao de
 * preco funciona no primeiro uso. Rodar: npm run seed
 */
import { unifiedSearch } from '../catalog.js';
import { categoryCounts } from '../catalog.js';

const TERMOS = [
  // mercearia
  'arroz', 'feijao carioca', 'feijao preto', 'macarrao espaguete', 'macarrao parafuso',
  'oleo de soja', 'azeite de oliva', 'acucar refinado', 'sal refinado', 'farinha de trigo',
  'molho de tomate', 'extrato de tomate', 'vinagre', 'maionese', 'ketchup', 'mostarda',
  'atum em lata', 'sardinha em lata', 'milho verde lata', 'ervilha lata', 'azeitona',
  'leite de coco', 'fuba', 'polvilho', 'amido de milho', 'caldo de galinha',
  // matinais
  'cafe', 'cafe soluvel', 'achocolatado em po', 'leite em po', 'aveia', 'granola',
  'cereal matinal', 'geleia', 'mel', 'torrada', 'cha', 'adocante', 'pao de forma',
  // frios e laticinios
  'leite integral', 'leite desnatado', 'leite zero lactose', 'iogurte natural',
  'iogurte grego', 'requeijao', 'manteiga', 'margarina', 'queijo mussarela',
  'queijo prato', 'queijo parmesao', 'presunto', 'mortadela', 'creme de leite',
  'leite condensado', 'ovos',
  // acougue
  'file de frango', 'coxa de frango', 'carne moida', 'picanha', 'alcatra', 'costela',
  'linguica toscana', 'bacon', 'salsicha', 'file de tilapia', 'camarao',
  // hortifruti
  'banana', 'maca', 'laranja', 'limao', 'tomate', 'cebola', 'batata', 'alho',
  'cenoura', 'alface', 'brocolis', 'abobrinha', 'mamao', 'abacate', 'uva',
  // padaria
  'pao frances', 'pao de queijo', 'bolo', 'bisnaguinha',
  // bebidas
  'agua mineral', 'refrigerante', 'suco de laranja', 'cerveja', 'vinho tinto',
  'energetico', 'agua de coco',
  // congelados
  'pizza congelada', 'nuggets', 'batata frita congelada', 'sorvete', 'acai', 'polpa de fruta',
  // doces e snacks
  'chocolate', 'biscoito recheado', 'bolacha agua e sal', 'salgadinho', 'amendoim',
  'castanha de caju', 'pipoca de microondas', 'gelatina',
  // limpeza
  'detergente', 'sabao em po', 'sabao liquido', 'amaciante', 'agua sanitaria',
  'desinfetante', 'limpador multiuso', 'esponja de aco', 'esponja de louca',
  'saco de lixo', 'lustra moveis', 'inseticida', 'papel toalha',
  // higiene
  'papel higienico', 'shampoo', 'condicionador', 'sabonete', 'creme dental',
  'escova de dente', 'fio dental', 'desodorante', 'absorvente', 'aparelho de barbear',
  'algodao', 'hidratante corporal', 'protetor solar',
  // bebe e pet
  'fralda', 'lenco umedecido', 'racao para cachorro', 'racao para gato', 'areia higienica',
  // casa
  'guardanapo', 'papel aluminio', 'filme plastico', 'pilha aa', 'lampada led', 'carvao',
];

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const apenas = process.argv[2] ? Number(process.argv[2]) : TERMOS.length;
  const termos = TERMOS.slice(0, apenas);
  console.log(`buscando ${termos.length} termos nos quatro mercados…\n`);

  let ok = 0;
  const falhas = new Map();
  for (const [indice, termo] of termos.entries()) {
    try {
      const { products, failed } = await unifiedSearch(termo, { limit: 24 });
      ok += products.length;
      for (const f of failed) falhas.set(f.market, (falhas.get(f.market) || 0) + 1);
      const marca = failed.length ? ` (${failed.map((f) => f.market).join(',')} falhou)` : '';
      console.log(`${String(indice + 1).padStart(3)}/${termos.length}  ${termo.padEnd(26)} ${String(products.length).padStart(3)} produtos${marca}`);
    } catch (err) {
      console.log(`${String(indice + 1).padStart(3)}/${termos.length}  ${termo.padEnd(26)} erro: ${err.message}`);
    }
    // Um respiro entre as buscas para nao martelar os sites dos mercados.
    await pausa(350);
  }

  console.log(`\n${ok} produtos gravados.`);
  if (falhas.size) console.log('mercados que falharam em algum termo:', [...falhas].map(([m, n]) => `${m} (${n}x)`).join(', '));
  console.log('\npor categoria:');
  for (const row of categoryCounts().sort((a, b) => b.total - a.total)) {
    console.log(`  ${row.category.padEnd(12)} ${row.total}`);
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
