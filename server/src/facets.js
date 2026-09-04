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
  /**
   * A mercearia deixou de ser deposito.
   *
   * Ela tinha 860 dos 1506 produtos do catalogo -- 57% -- porque massas,
   * molhos, temperos e oleos moravam dentro dela como "tipo". Corredor desse
   * tamanho nao afunila: sao quatro viagens diferentes a loja, e cada uma
   * virou placa propria. Aqui ficou o que sobra e que de fato se procura
   * junto: o basico do armario e a lata.
   */
  mercearia: [
    // O veto existe porque "Biscoito de Arroz" nao e arroz: a palavra esta la,
    // o produto e outro. Sem isso o filtro de arroz enche de snack.
    ['arroz_feijao', 'Arroz e feijão', /\barroz\b|\bfeijao\b|lentilha|grao de bico|canjica|milho para pipoca|quinoa/, /biscoito|bolacha|snack|farinha de|bebida de|cracker/],
    ['peixe_lata', 'Atum e sardinha', /\batum\b|\bsardinha\b|anchova/],
    ['enlatados', 'Conservas e legumes', /milho.?verde|\bervilha\b|azeitona|palmito|seleta|conserva|pepino em|\bpate\b|patê|aspargo|cogumelo|champignon|tomate seco/],
    ['farinhas', 'Farinhas', /farinha|\bfuba\b|amido de milho|polvilho|trigo para|farofa|panko|\bmaisena\b|\bmaizena\b/],
    ['acucar', 'Açúcar e adoçante', /\bacucar\b|adocante|rapadura|melado|\bmel\b/],
    ['sopas', 'Sopas e prontos', /\bsopa\b|creme de cebola|cuscuz|\bpure\b|risoto pronto|feijoada em|caldo pronto/],
    ['coco', 'Coco e leites vegetais', /leite de coco|leite vegetal|bebida de (amendoas|aveia|soja)|coco ralado/],
  ],

  // Massa longa e massa curta sao escolhas diferentes na mesma receita: quem
  // quer espaguete nao quer parafuso. O veto de molho existe porque "Molho
  // para Massas" e molho, e o nome traz a palavra.
  massas: [
    ['longa', 'Espaguete e talharim', /espaguete|spaghetti|talharim|linguine|fettucc?ine|cabelo de anjo|bavette|pappardelle|vermicelli/, /molho|tempero/],
    ['curta', 'Parafuso, penne e afins', /parafuso|fusilli|\bpenne\b|conchiglione|conchinha|rigatoni|farfalle|gravatinha|ave.?maria|argolinha|padre.?nosso|\bcaracol\b|macarrao (para|de) sopa/, /molho|tempero/],
    ['instantanea', 'Instantâneo', /instantaneo|\bmiojo\b|\blamen\b|\bramen\b|cup noodles/],
    ['forno', 'Lasanha e recheadas', /lasanha|canelone|rondelli|nhoque|capeletti|ravioli|tortelli/],
    ['integral', 'Integral e sem glúten', /integral|sem gluten|grao inteiro|arroz e milho/],
  ],

  // "Molhos" era um filtro so com 366 produtos, um terco do corredor antigo.
  // Ninguem vai ao mercado buscar "molho" -- vai buscar maionese.
  molhos: [
    ['tomate', 'Molho de tomate', /molho (de )?tomate|extrato (de )?tomate|polpa (de )?tomate|tomate pelado|passata|molho pronto|molho refogado|molho bolonhesa|molho sugo|molho para massas?/],
    ['maionese', 'Maionese', /maionese/],
    ['ketchup', 'Ketchup', /ketchup|catchup/],
    ['mostarda', 'Mostarda', /mostarda/],
    ['pimenta', 'Pimenta', /molho de pimenta|\btabasco\b|pimenta em (conserva|molho)|sriracha/],
    ['orientais', 'Shoyu e orientais', /\bshoyu\b|molho de soja|tarê|\btare\b|\bteriyaki\b|agridoce|\bwasabi\b/],
    ['salada', 'Para salada e churrasco', /barbecue|\bbbq\b|molho ingles|worcester|molho (para|de) salada|molho cesar|vinagrete|chimichurri/],
  ],

  // "Caldo Bom" e marca de farinha e de fuba, e a regra procurava "caldo": sem
  // o veto, farinha de mandioca cai aqui.
  temperos: [
    ['sal', 'Sal', /\bsal\b|sal refinado|sal grosso|sal marinho|\bflor de sal\b/, /salsa|salsicha|salsaretti/],
    ['caldos', 'Caldos e sazonadores', /\bcaldo\b|sazon|tempero pronto|tempero completo|\bknorr\b|\bmaggi\b/, /caldo bom|farinha|\bfuba\b/],
    ['ervas', 'Ervas', /oregano|manjericao|folha de louro|\bsalsa\b desidratada|cebolinha|\bervas\b|tomilho|rosmarinho|romario|coentro/],
    ['moidos', 'Pimenta, colorau e curry', /pimenta do reino|colorau|\bpaprica\b|\bcurry\b|cominho|acafrao|noz.?moscada|\bcravo\b|\bcanela\b|\bgengibre\b em po|acucar de baunilha/],
    ['alho', 'Alho e cebola', /alho e sal|alho (frito|granulado|em po)|cebola (em po|granulada|desidratada)/],
  ],

  oleos: [
    ['azeite', 'Azeite', /azeite/],
    ['oleo', 'Óleo', /\boleo\b|banha|gordura de coco|gordura vegetal/],
    ['vinagre', 'Vinagre', /vinagre/],
    ['especiais', 'Aceto e especiais', /\baceto\b|balsamico|oleo de (coco|linhaca|abacate|gergelim)/],
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

/**
 * A marca como chave de agrupamento.
 *
 * Cada mercado escreve do seu jeito -- "YPÊ", "Ypê", "ype" -- e sem dobrar
 * essas variacoes numa chave so o filtro de marca virava tres filtros que
 * escondiam produtos um do outro. Foi o que aconteceu com o detergente: filtrar
 * "Ypê" no corredor de limpeza nao trazia o que estava gravado como "YPÊ".
 */
export const brandKey = (marca) => fold(marca).replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Como a marca aparece na tela. Entre as variacoes, ganha a mais frequente; se
 * ela vier gritando em caixa alta, volta para caixa de titulo -- "IMPERATRIZ"
 * no meio de uma fileira de etiquetas parece erro.
 */
export function brandLabel(variacoes) {
  const contagem = new Map();
  for (const v of variacoes) contagem.set(v, (contagem.get(v) || 0) + 1);
  const escolhida = [...contagem.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))[0][0];
  const semAcento = escolhida.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (semAcento.length > 2 && escolhida === escolhida.toUpperCase()) {
    return escolhida
      .toLowerCase()
      .replace(/(^|[\s\-/])([a-zà-ÿ])/g, (_, antes, letra) => antes + letra.toUpperCase());
  }
  return escolhida;
}

/**
 * As dimensoes pelas quais se filtra uma prateleira. Cada uma sabe extrair os
 * seus valores de um produto, como se chama na tela e em que ordem aparece.
 *
 * O mercado e multivalorado (um produto esta em varios), e por isso mora aqui
 * junto das outras em vez de virar um caso especial em cada consulta.
 */
export const DIMENSOES = {
  sub: {
    valores: (r) => (r.subcategory ? [r.subcategory] : ['outros']),
    rotulo: (chave, _v, ctx) => (chave === 'outros' ? 'Outros' : subLabel(ctx.category, chave)),
    ordem: (a, b, ctx) => ordemSub(ctx.category, a.key) - ordemSub(ctx.category, b.key),
    /**
     * Tipo com um produto so nao ajuda a afunilar, e enche a barra.
     *
     * O catalogo entra aos poucos, entao um tipo legitimo pode nascer com um
     * item -- "Macarrão instantâneo" tinha 1 na medicao. Ele volta a aparecer
     * sozinho quando o corredor encher, e por isso o corte e por contagem e
     * nao uma lista de excecoes. Mesmo criterio de marca e tamanho.
     */
    corte: (itens) => {
      const usados = itens.filter((i) => i.count > 1);
      return usados.length >= 2 ? usados : itens;
    },
  },
  category: {
    valores: (r) => (r.category ? [r.category] : []),
    rotulo: (chave, _v, ctx) => ctx.categoryLabel?.(chave) ?? chave,
    ordem: (a, b, ctx) => (ctx.categoryOrder?.(a.key) ?? 0) - (ctx.categoryOrder?.(b.key) ?? 0),
  },
  brand: {
    valores: (r) => {
      const chave = brandKey(r.brand);
      return chave ? [chave] : [];
    },
    rotulo: (_chave, variacoes) => brandLabel(variacoes),
    ordem: (a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'),
    // Marca com um produto so nao ajuda a afunilar, e sao dezenas delas.
    corte: (itens) => {
      const usadas = itens.filter((i) => i.count > 1);
      return (usadas.length >= 2 ? usadas : itens).slice(0, 30);
    },
  },
  size: {
    valores: (r) => (r.size_label ? [r.size_label] : []),
    rotulo: (chave) => chave,
    ordem: (a, b) => a.ordem - b.ordem,
    corte: (itens) => {
      // Tamanho de um produto so nao e filtro, e ficava na frente da fila
      // empurrando o "1 kg" para fora da tela.
      const usados = itens.filter((i) => i.count > 1);
      return (usados.length >= 2 ? usados : itens).slice(0, 20);
    },
  },
  market: {
    valores: (r) => r.markets || [],
    rotulo: (chave, _v, ctx) => ctx.marketLabel?.(chave) ?? chave,
    ordem: (a, b, ctx) => (ctx.marketOrder?.(a.key) ?? 0) - (ctx.marketOrder?.(b.key) ?? 0),
  },
};

function ordemSub(category, key) {
  const regras = SUBCATEGORIAS[category] || [];
  const i = regras.findIndex(([k]) => k === key);
  return i < 0 ? 99 : i;
}

/**
 * O produto atende ao filtro daquela dimensao?
 *
 * O escolhido pode ser mais de um, separados por virgula ("angeloni,festval"),
 * e ai vale qualquer um deles. Isso existe pelo mercado: "hoje eu vou no
 * Angeloni e no Festval" e uma pergunta legitima, e sem o "ou" ela nao cabe
 * num filtro de um valor. Como a regra mora aqui e todas as dimensoes passam
 * por ela, marca e tamanho ganham o mesmo poder de graca.
 */
function atende(row, dim, escolhido) {
  if (!escolhido) return true;
  const querido = String(escolhido)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  if (!querido.length) return true;
  const valores = DIMENSOES[dim].valores(row);
  if (dim === 'brand') {
    // Marca casa tambem pelo nome: produto que veio sem marca preenchida, mas
    // com "ypê" no nome, e Ypê para quem esta filtrando.
    return querido.some((q) => valores.includes(q) || fold(row.name).includes(q));
  }
  return querido.some((q) => valores.includes(q));
}

/**
 * Conta as opcoes de cada filtro. A contagem de uma dimensao ignora o filtro
 * dela mesma: com "Refrigerante" marcado, as marcas mostram quantos
 * refrigerantes cada uma tem, e os tipos continuam mostrando a prateleira
 * inteira -- e o que permite trocar de tipo sem cair numa tela vazia.
 */
export function facetar(rows, filtros, dimensoes, ctx = {}) {
  const casa = (row, exceto) => dimensoes.every((dim) => dim === exceto || atende(row, dim, filtros[dim]));

  const facetas = {};
  for (const dim of dimensoes) {
    const grupos = new Map();
    for (const row of rows) {
      if (!casa(row, dim)) continue;
      for (const valor of DIMENSOES[dim].valores(row)) {
        if (!grupos.has(valor)) grupos.set(valor, { count: 0, variacoes: [], ordem: row.size_value ?? 0 });
        const grupo = grupos.get(valor);
        grupo.count += 1;
        if (dim === 'brand' && row.brand) grupo.variacoes.push(row.brand);
      }
    }
    let itens = [...grupos.entries()].map(([key, g]) => ({
      key,
      label: DIMENSOES[dim].rotulo(key, g.variacoes, ctx),
      count: g.count,
      ordem: g.ordem,
    }));
    itens.sort((a, b) => DIMENSOES[dim].ordem(a, b, ctx));
    if (DIMENSOES[dim].corte) itens = DIMENSOES[dim].corte(itens);
    facetas[dim] = itens.map(({ ordem, ...resto }) => resto);
  }
  return facetas;
}

/** Aplica todos os filtros de uma vez. */
export const filtrar = (rows, filtros, dimensoes) =>
  rows.filter((row) => dimensoes.every((dim) => atende(row, dim, filtros[dim])));
