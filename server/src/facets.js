import { fold } from './categories.js';

/**
 * Dentro do corredor ainda ha muita coisa: "Bebidas" tem agua, suco,
 * refrigerante e cerveja, e nada disso se procura junto. Aqui o corredor
 * ganha subdivisoes, marca e tamanho -- os tres filtros que afunilam de
 * verdade quando a prateleira tem duzentos produtos.
 *
 * As tres informacoes saem do nome do produto, que e o unico dado que todos
 * os mercados dao do mesmo jeito. Ficam gravadas no produto, junto da
 * categoria, e sao refeitas quando as regras mudam de versao.
 */

// Por categoria, na ordem: a primeira regra que casar ganha, entao o que e
// mais especifico vem antes ("agua de coco" antes de "agua").
const SUBCATEGORIAS = {
  bebidas: [
    ['agua_coco', 'Água de coco', /agua de coco/],
    ['tonica', 'Tônica', /agua tonica|\btonica\b|schweppes/],
    ['agua', 'Água', /agua (mineral|de mesa|natural|com gas|sem gas|adicionada)|\bagua\b/],
    ['suco', 'Suco', /\bsucos?\b|nectar|refresco|polpa para suco|uva integral/],
    ['refrigerante', 'Refrigerante', /refrigerante|coca.?cola|pepsi|guarana|fanta|sprite|soda limonada|dolly|kuat|cola\b/],
    ['cerveja', 'Cerveja', /cerveja|chopp|lager|puro malte|\bipa\b|heineken|brahma|skol|antarctica|budweiser|corona|stella|itaipava|amstel|eisenbahn|original/],
    ['energetico', 'Energético e isotônico', /energetico|isotonico|red bull|monster|gatorade|powerade|\bbaly\b|fusion/],
    ['cha_gelado', 'Chá e café gelado', /cha gelado|ice tea|chazinho|matte|leao\b|cafe gelado|kombucha/],
    ['vinho', 'Vinho e espumante', /\bvinho|espumante|prosecco|sangria|sidra/],
    ['destilado', 'Destilado', /whisky|whiskey|vodka|cachaca|\bgin\b|\brum\b|tequila|licor|conhaque|aperitivo|saque|vermute/],
  ],
  limpeza: [
    ['roupa', 'Roupa', /sabao (em po|liquido|em barra|de coco)|amaciante|alvejante|tira.?manchas|\bomo\b|vanish|lava.?roupas/],
    ['louca', 'Louça', /detergente|lava.?loucas|esponja|palha de aco|bombril/],
    ['superficie', 'Casa e superfícies', /desinfetante|multiuso|limpador|agua sanitaria|candida|\bcloro\b|lustra|desengordurante|limpa.?vidros|tira.?limo|veja\b/],
    ['banheiro', 'Banheiro', /sanitario|\bpato\b|harpic|desodorizador|pedra sanitaria/],
    ['utensilio', 'Panos e utensílios', /saco de lixo|papel toalha|guardanapo|\bluva|pano de (chao|prato)|flanela|esfregao|vassoura|\brodo\b|balde|escova de limpeza/],
    ['inseticida', 'Inseticida', /inseticida|\braid\b|\bsbp\b|mata.?mosca|cupim|formiga/],
  ],
  higiene: [
    ['cabelo', 'Cabelo', /shampoo|xampu|condicionador|creme para pentear|tintura|finalizador|leave.?in|oleo capilar/],
    ['oral', 'Boca e dentes', /creme dental|pasta de dente|escova de dente|enxaguante|fio dental|antisseptico bucal|colgate|oral.?b/],
    ['corpo', 'Corpo e banho', /sabonete|hidratante|desodorante|\btalco\b|protetor solar|oleo corporal|esfoliante|sabonete liquido/],
    ['papel', 'Papel', /papel higienico|lenco de papel|lencos de papel/],
    ['feminino', 'Feminino', /absorvente|protetor diario|coletor menstrual|\bintimo\b/],
    ['barbear', 'Barbear', /barbear|gilette|gillette|\blamina|aparelho de barbear|pos.?barba/],
    ['farmacia', 'Farmacinha', /analgesico|dipirona|paracetamol|ibuprofeno|band.?aid|curativo|soro fisiologico|alcool (70|gel|etilico)|termometro|preservativo/],
  ],
  mercearia: [
    // O veto existe porque "Biscoito de Arroz" nao e arroz: a palavra esta la,
    // o produto e outro. Sem isso o filtro de arroz enche de snack.
    ['arroz_feijao', 'Arroz e feijão', /\barroz\b|\bfeijao\b|lentilha|grao de bico|canjica|milho para pipoca|quinoa/, /biscoito|bolacha|snack|farinha de|bebida de/],
    ['massas', 'Massas', /macarrao|espaguete|\bpenne\b|parafuso|talharim|nhoque|massa (para|de) |instantaneo|miojo/],
    ['oleo', 'Óleo e vinagre', /\boleo\b|azeite|vinagre|banha/],
    ['molhos', 'Molhos', /\bmolho|extrato de tomate|polpa de tomate|ketchup|maionese|mostarda|shoyu|barbecue|pimenta em|tomate pelado/],
    ['temperos', 'Temperos', /\bsal\b|sal refinado|tempero|colorau|oregano|cominho|pimenta do reino|alho e sal|\bcaldo\b|folha de louro|canela|acafrao|curry/],
    ['farinhas', 'Farinhas', /farinha|\bfuba\b|amido de milho|polvilho|trigo para|farofa|panko/],
    ['acucar', 'Açúcar', /\bacucar\b|adocante|rapadura|melado/],
    ['enlatados', 'Enlatados e conservas', /\batum\b|sardinha em|milho verde|ervilha em|azeitona|palmito|seleta|conserva|pepino em|patê|pate de/],
    ['sopas', 'Sopas e prontos', /\bsopa\b|creme de cebola|cuscuz|\bpure\b|risoto pronto|feijoada em/],
    ['coco', 'Coco e leites vegetais', /leite de coco|leite vegetal|bebida de (amendoas|aveia|soja)|coco ralado/],
  ],
  hortifruti: [
    ['ovos', 'Ovos', /\bovos?\b/],
    ['frutas', 'Frutas', /banana|\bmaca\b|laranja|mamao|melancia|\buva\b|\bmanga\b|abacaxi|\bpera\b|\bkiwi\b|morango|\blimao\b|abacate|\bmelao\b|tangerina|ameixa|goiaba|maracuja|pessego|caqui|acerola|figo\b|cereja|nectarina|mexerica|poncan/],
    ['folhas', 'Folhas e temperos', /alface|rucula|\bcouve\b|espinafre|agriao|repolho|acelga|cheiro verde|salsinha|cebolinha|coentro|manjericao|hortela|almeirao|escarola|\bervas\b/],
    ['legumes', 'Legumes e raízes', /batata|cebola|tomate|cenoura|abobrinha|beterraba|pepino|chuchu|berinjela|pimentao|brocolis|couve.?flor|\bvagem\b|quiabo|mandioca|abobora|inhame|gengibre|\balho\b|milho verde|ervilha fresca|nabo|rabanete/],
  ],
  acougue: [
    ['bovina', 'Boi', /bovin|picanha|alcatra|patinho|coxao|maminha|fraldinha|contra.?file|costela|\bacem\b|musculo|\bcupim\b|carne moida|file mignon|\bbife\b|paleta|peito bovino/],
    ['ave', 'Aves', /frango|galinha|peito de frango|\bcoxa\b|sobrecoxa|\basa de|file de frango|\bperu\b|chester|coracao de frango|codorna/],
    ['suina', 'Porco', /suin|pernil|\blombo\b|costelinha|bisteca|panceta|\bbacon\b|joelho|\bpaio\b|toucinho/],
    ['peixe', 'Peixes e frutos do mar', /peixe|tilapia|salmao|merluza|sardinha|camarao|\bpolvo\b|\blula\b|bacalhau|pescada|linguado|atum fresco|\bpostas?\b|mexilhao/],
    ['embutidos', 'Embutidos', /linguica|salsicha|salame|calabresa|\bkafta\b|hamburguer|almondega|nuggets|apresuntado/],
  ],
  frios: [
    ['queijo', 'Queijos', /queijo|mussarela|\bprato\b|parmesao|provolone|ricota|cottage|gorgonzola|\bcoalho\b|catupiry|requeijao|cream cheese|brie|minas/],
    ['leite', 'Leite', /\bleite\b|leite integral|desnatado|semidesnatado|zero lactose/, /de coco|em po|condensado|doce de leite|creme de leite/],
    ['iogurte', 'Iogurtes', /iogurte|bebida lactea|\bkefir\b|\bdanone\b|activia/],
    ['manteiga', 'Manteiga e cremes', /manteiga|margarina|creme de leite|\bnata\b|chantilly/],
    ['fatiados', 'Fatiados', /presunto|mortadela|peito de peru|blanquet|\bcopa\b|pastrami|salaminho|\bpeperoni\b|pepperoni/],
  ],
  matinais: [
    ['cafe', 'Café', /\bcafe\b|capuccino|cappuccino|\bexpresso\b|capsula|\bmoido\b|\btorrado\b/],
    ['cha', 'Chá', /\bcha\b|\bchas\b|erva mate|\bmate\b|camomila|hibisco|erva.?doce/],
    ['achocolatado', 'Achocolatado', /achocolatado|nescau|\btoddy\b|chocolate em po|cacau em po/],
    ['leite_po', 'Leite em pó', /leite em po|\bninho\b|composto lacteo|leite instantaneo/],
    ['cereal', 'Cereais', /cereal|granola|\baveia\b|sucrilhos|flocos de milho|barra de cereal|\bmusli\b|farelo/],
    ['pasta', 'Geleia, mel e cremes', /geleia|\bmel\b|pasta de amendoim|creme de avela|nutella|doce de fruta/],
    ['torrada', 'Torradas e bolachas', /torrada|biscoito de agua|cream cracker|\bwater\b|biscoito integral/],
    ['adocante', 'Adoçante', /adocante|stevia|xilitol/],
  ],
  doces: [
    ['chocolate', 'Chocolate', /chocolate|bombom|\btrufa\b|ovo de pascoa|kit.?kat|\blacta\b|\bbis\b|\bdiamante negro\b|alpino/],
    ['bala', 'Balas e gomas', /\bbala\b|balas|chiclete|pirulito|jujuba|\bgoma\b|halls|mentos/],
    ['biscoito', 'Biscoitos', /biscoito|bolacha|\bwafer\b|cookie|recheado|maria\b|maisena/],
    ['salgadinho', 'Salgadinhos', /salgadinho|\bchips\b|batata palha|pipoca|doritos|ruffles|cheetos|torcida|fandangos/],
    ['castanhas', 'Castanhas e frutas secas', /amendoim|castanha|\bnozes\b|amendoas|semente de|\bpassas\b|damasco|banana passa|mix de nuts/],
    ['sobremesa', 'Sobremesas', /gelatina|\bpudim\b|\bflan\b|sobremesa|leite condensado|doce de leite|creme de leite condensado|paçoca|pacoca/],
  ],
  congelados: [
    ['pizza', 'Pizza', /pizza/],
    ['empanado', 'Empanados', /nuggets|empanado|\bsteak\b|hamburguer|frango a passarinho/],
    ['batata', 'Batata', /batata (frita|congelada|palito|noisette|smiles)/],
    ['sorvete', 'Sorvete e açaí', /sorvete|\bacai\b|picole|\bgelato\b|frozen/],
    ['legumes', 'Legumes congelados', /(brocolis|ervilha|seleta|legumes|milho|couve.?flor|vagem) congelad/],
    ['pronto', 'Pratos prontos', /lasanha|escondidinho|\btorta\b|panqueca|pao de queijo|massa folhada|comida pronta|strogonoff|feijoada/],
    ['peixe', 'Peixes congelados', /file de (tilapia|merluza|salmao|pescada)|camarao congelado|\bpescado\b/],
  ],
  bebe: [
    ['fralda', 'Fraldas', /fralda/],
    ['lenco', 'Lenços umedecidos', /lenco umedecido|toalha umedecida/],
    ['papinha', 'Papinhas', /papinha|refeicao infantil|fruta em pote|sopinha/],
    ['formula', 'Fórmulas e leites', /formula infantil|\bnan\b|aptamil|milnutri|leite infantil|composto lacteo infantil/],
    ['higiene', 'Higiene do bebê', /shampoo infantil|sabonete infantil|pomada|hidratante infantil|colonia infantil|banho/],
  ],
  pet: [
    ['racao', 'Ração', /\bracao\b|alimento (seco|umido)|\bsache\b|\bsachê\b/],
    ['petisco', 'Petiscos', /petisco|bifinho|osso|snack para/],
    ['higiene', 'Higiene', /areia (higienica|sanitaria)|tapete higienico|shampoo (para )?(caes|gatos|cachorro)|antipulgas|vermifugo/],
    ['acessorio', 'Acessórios', /coleira|brinquedo|comedouro|bebedouro|\bcama\b|caixa de transporte|arranhador/],
  ],
  padaria: [
    ['pao', 'Pães', /\bpao\b|\bpaes\b|baguete|bisnaga|bisnaguinha|frances|\bforma\b|brioche|ciabatta|\bfocaccia\b/],
    ['bolo', 'Bolos e tortas', /\bbolo\b|\btorta\b|rocambole|\bsonho\b|\brosca\b|\bcuca\b|panetone/],
    ['salgado', 'Salgados', /salgado|coxinha|esfiha|empada|\bpastel\b|enroladinho|pao de queijo|\bfolhado\b/],
    ['doce', 'Doces da padaria', /\bdoce\b|brownie|cookie|carolina|bomba de chocolate|sonho de/],
  ],
  casa: [
    ['cozinha', 'Cozinha', /panela|frigideira|\bprato\b|\bcopo\b|talher|caneca|\bforma\b|assadeira|\bpote\b|tabua|escorredor|garrafa termica|abridor/],
    ['descartavel', 'Descartáveis', /papel aluminio|filme plastico|papel manteiga|copo descartavel|prato descartavel|palito|canudo|marmita/],
    ['eletro', 'Elétrica', /lampada|\bpilha\b|bateria|extensao|\btomada\b|ventilador|liquidificador|\bfiltro\b/],
    ['churrasco', 'Churrasco', /\bcarvao\b|espeto|churrasqueira|acendedor|sal grosso|\bgrelha\b/],
    ['papelaria', 'Papelaria', /caderno|caneta|lapis|\bcola\b|fita adesiva|papel sulfite|envelope/],
  ],
};

const SUB_LABELS = new Map();
for (const [categoria, regras] of Object.entries(SUBCATEGORIAS)) {
  for (const [key, label] of regras) SUB_LABELS.set(`${categoria}:${key}`, label);
}

/** Subdivisao do corredor a partir do nome. Sem regra que case, devolve null. */
export function subclassify(category, productName) {
  const regras = SUBCATEGORIAS[category];
  if (!regras) return null;
  const nome = fold(productName);
  for (const [key, , re, veto] of regras) {
    if (!re.test(nome)) continue;
    if (veto && veto.test(nome)) continue;
    return key;
  }
  return null;
}

export function subLabel(category, key) {
  return SUB_LABELS.get(`${category}:${key}`) || key;
}

/** As subdivisoes possiveis de um corredor, na ordem em que foram escritas. */
export function subsOf(category) {
  return (SUBCATEGORIAS[category] || []).map(([key, label]) => ({ key, label }));
}

// Cada unidade sabe para quanto converter (ml ou g) e como se escreve.
const UNIDADES = new Map([
  ['ml', { kind: 'volume', mult: 1 }],
  ['l', { kind: 'volume', mult: 1000 }],
  ['lt', { kind: 'volume', mult: 1000 }],
  ['lts', { kind: 'volume', mult: 1000 }],
  ['litro', { kind: 'volume', mult: 1000 }],
  ['litros', { kind: 'volume', mult: 1000 }],
  ['g', { kind: 'peso', mult: 1 }],
  ['gr', { kind: 'peso', mult: 1 }],
  ['grs', { kind: 'peso', mult: 1 }],
  ['grama', { kind: 'peso', mult: 1 }],
  ['gramas', { kind: 'peso', mult: 1 }],
  ['kg', { kind: 'peso', mult: 1000 }],
  ['kgs', { kind: 'peso', mult: 1000 }],
  ['quilo', { kind: 'peso', mult: 1000 }],
  ['quilos', { kind: 'peso', mult: 1000 }],
  ['un', { kind: 'unidade', mult: 1, palavra: 'un' }],
  ['und', { kind: 'unidade', mult: 1, palavra: 'un' }],
  ['unid', { kind: 'unidade', mult: 1, palavra: 'un' }],
  ['unidade', { kind: 'unidade', mult: 1, palavra: 'un' }],
  ['unidades', { kind: 'unidade', mult: 1, palavra: 'un' }],
  ['rolo', { kind: 'unidade', mult: 1, palavra: 'rolos' }],
  ['rolos', { kind: 'unidade', mult: 1, palavra: 'rolos' }],
  ['capsula', { kind: 'unidade', mult: 1, palavra: 'cáps' }],
  ['capsulas', { kind: 'unidade', mult: 1, palavra: 'cáps' }],
  ['folhas', { kind: 'unidade', mult: 1, palavra: 'folhas' }],
]);

const MEDIDAS = [...UNIDADES.keys()].sort((a, b) => b.length - a.length).join('|');
// "12x350ml": o pack e um tamanho proprio, nao doze produtos de 350 ml.
const PACK = new RegExp(`(\\d+)\\s*[x×]\\s*(\\d+(?:[.,]\\d+)?)\\s*(${MEDIDAS})\\b`);
const SIMPLES = new RegExp(`(?:^|[\\s(])(\\d+(?:[.,]\\d+)?)\\s*(${MEDIDAS})\\b`);

const numero = (n) => Number(String(n).replace(',', '.'));

function escreve(valor, kind, palavra) {
  const bonito = (n) => String(Number(n.toFixed(2))).replace('.', ',');
  if (kind === 'volume') return valor >= 1000 ? `${bonito(valor / 1000)} L` : `${bonito(valor)} ml`;
  if (kind === 'peso') return valor >= 1000 ? `${bonito(valor / 1000)} kg` : `${bonito(valor)} g`;
  return `${bonito(valor)} ${palavra || 'un'}`;
}

/**
 * Tamanho tirado do nome: "Agua Mineral Ouro Fino 6 Litros" -> 6 L. O valor
 * normalizado (em ml ou g) serve para ordenar os filtros do menor ao maior;
 * sem ele "500 ml" viria depois de "2 L" na ordem alfabetica.
 */
export function parseSize(productName) {
  const nome = fold(productName);
  const pack = PACK.exec(nome);
  if (pack) {
    const [, quantos, medida, unidade] = pack;
    const u = UNIDADES.get(unidade);
    const cada = numero(medida) * u.mult;
    return {
      label: `${Number(quantos)}x${escreve(cada, u.kind, u.palavra)}`,
      value: Number(quantos) * cada,
      kind: u.kind,
    };
  }
  const simples = SIMPLES.exec(nome);
  if (!simples) return null;
  const [, medida, unidade] = simples;
  const u = UNIDADES.get(unidade);
  const valor = numero(medida) * u.mult;
  if (!Number.isFinite(valor) || valor <= 0) return null;
  return { label: escreve(valor, u.kind, u.palavra), value: valor, kind: u.kind };
}
