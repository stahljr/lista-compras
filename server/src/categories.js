/**
 * Cada mercado tem a sua propria arvore de categorias, com nomes e niveis
 * diferentes. Aqui tudo e reduzido a uma lista curta que faz sentido dentro
 * de casa -- e que tambem define a ordem em que a lista aparece no mercado,
 * seguindo mais ou menos o caminho que se faz entre as gondolas.
 */
export const CATEGORIES = [
  { key: 'hortifruti', label: 'Hortifruti', emoji: '🥬', order: 1 },
  { key: 'padaria', label: 'Padaria', emoji: '🥖', order: 2 },
  { key: 'acougue', label: 'Carnes e Peixes', emoji: '🥩', order: 3 },
  { key: 'frios', label: 'Frios e Laticínios', emoji: '🧀', order: 4 },
  { key: 'matinais', label: 'Matinais', emoji: '☕', order: 5 },
  { key: 'mercearia', label: 'Mercearia', emoji: '🍚', order: 6 },
  { key: 'doces', label: 'Doces e Snacks', emoji: '🍫', order: 7 },
  { key: 'congelados', label: 'Congelados', emoji: '🧊', order: 8 },
  { key: 'bebidas', label: 'Bebidas', emoji: '🧴', order: 9 },
  { key: 'limpeza', label: 'Limpeza', emoji: '🧽', order: 10 },
  { key: 'higiene', label: 'Higiene e Beleza', emoji: '🧼', order: 11 },
  { key: 'bebe', label: 'Bebê', emoji: '🍼', order: 12 },
  { key: 'pet', label: 'Pet', emoji: '🐾', order: 13 },
  { key: 'casa', label: 'Casa e Utilidades', emoji: '🏠', order: 14 },
  { key: 'outros', label: 'Outros', emoji: '📦', order: 99 },
];

export const CATEGORY_BY_KEY = new Map(CATEGORIES.map((c) => [c.key, c]));

export function categoryOrder(key) {
  return CATEGORY_BY_KEY.get(key)?.order ?? 98;
}

export function categoryLabel(key) {
  return CATEGORY_BY_KEY.get(key)?.label ?? 'Outros';
}

/** Remove acentos e baixa a caixa, para as regras casarem sem surpresa. */
export function fold(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

// A ordem importa: a primeira regra que casar ganha. Regras mais especificas
// vem antes das genericas (ex.: "leite de coco" e mercearia, nao laticinio).
const RULES = [
  ['bebe', /fralda|infantil|papinha|mamadeira|chupeta|bebe\b|lenco umedecido|formula infantil|nan |aptamil|milnutri/],
  ['pet', /\bpet\b|racao|caes|cachorro|gatos?\b|felino|canino|areia higienica|petisco para/],
  ['limpeza', /limpeza|detergente|sabao|amaciante|desinfetante|agua sanitaria|alvejante|candida|lustra|desengordurante|multiuso|esponja|saco de lixo|vassoura|rodo|inseticida|odorizador|cloro|tira.?limo/],
  ['higiene', /higiene|beleza|perfumaria|shampoo|xampu|condicionador|sabonete|desodorante|creme dental|escova de dente|fio dental|papel higienico|absorvente|barbear|gilette|hidratante|protetor solar|maquiagem|algodao|cotonete|preservativo|farmacia|medicament/],
  ['hortifruti', /hortifruti|frutas|verduras|legumes|folhosos|tempero fresco|ovos\b|batata|cebola|tomate|banana|maca\b|laranja|limao|alface|cenoura|abacate|mamao|melancia|uva\b|manga\b|abacaxi|brocolis|couve|repolho|pepino|abobrinha|beterraba|mandioca|alho\b/],
  ['padaria', /padaria|confeitaria|pao\b|paes|baguete|croissant|bolo\b|torta|rosca|sonho|salgados|panificados|broa|bisnaguinha/],
  ['acougue', /acougue|carnes|peixaria|peixes|frango|bovina|suina|linguica|salsicha|bacon|costela|picanha|alcatra|patinho|coxao|file de|camarao|tilapia|salmao|sardinha fresca|pernil|cupim|maminha|fraldinha|carne moida/],
  ['frios', /frios|laticinios|queijo|presunto|mortadela|salame|iogurte|requeijao|manteiga|margarina|cream cheese|nata\b|creme de leite fresco|leite\b|mussarela|parmesao|ricota|catupiry/],
  ['matinais', /matinais|cafe\b|cafes|capuccino|cappuccino|cereal|cereais|granola|aveia|achocolatado|nescau|toddy|leite em po|ninho|geleia|mel\b|torrada|biscoito de agua|cha\b|chas\b|adocante/],
  ['congelados', /congelad|sorvete|acai|pizza congelada|nuggets|hamburguer congelado|batata frita congelada|polpa de fruta|empanado|lasanha congelada|gelo\b/],
  ['bebidas', /bebidas|refrigerante|cerveja|vinho|suco|agua mineral|energetico|isotonico|whisky|vodka|cachaca|gin\b|espumante|destilado|tonica|guarana|coca.?cola|pepsi|heineken|brahma|skol|antarctica/],
  ['doces', /doces|snacks|passas?\b|chocolate|bombom|bala\b|chiclete|pirulito|salgadinho|batata chips|biscoito|bolacha|wafer|amendoim|castanha|pipoca|pacoca|brigadeiro|sobremesa|gelatina|pudim|leite condensado|doce de leite/],
  ['mercearia', /mercearia|alimentos basicos|arroz|feijao|macarrao|massa\b|massas|molho de tomate|extrato de tomate|oleo\b|azeite|vinagre|sal\b|acucar|farinha|fuba|amido|temperos|condimento|maionese|ketchup|mostarda|conservas|atum|sardinha|milho verde|ervilha|azeitona|palmito|leite de coco|caldo\b|sopa\b|proteina de soja|granel|enlatado|mantimento/],
  ['casa', /casa|bazar|utilidades|utilidade domestica|panela|prato|copo\b|talher|louca|papelaria|eletro|lampada|pilha|bateria|ferramenta|jardim|churrasco|carvao|guardanapo|papel toalha|filme plastico|papel aluminio|pote|garrafa termica|brinquedo|vestuario|cama mesa|banho|toalha/],
];

// Os nomes dos produtos estao cheios de palavras que pertencem a outro
// corredor: "Molho de Tomate sabor Pizza", "Maionese sabor Bacon", "Leite em
// Po". Uma regra generica de uma palavra (leite, bacon, pizza, tomate) casa
// antes da especifica e manda o produto para o lugar errado.
//
// Por isso os termos compostos, que quase nao erram, sao testados primeiro --
// antes das regras genericas e antes mesmo da categoria que a loja informou.
const ESPECIFICOS = [
  // Comida de bicho e de bebe vem primeiro de todas: "Alimento para Caes
  // Sabor Carne, Frango e Arroz" caia na mercearia por causa do arroz.
  ['pet', /\bracao\b|(para|de) (caes|gatos|cachorros?|felinos|caninos|passaros|peixes|roedores)|dog chow|pedigree|whiskas|friskies|premier pet|golden (formula|special)|areia (higienica|sanitaria)|tapete higienico|antipulgas|bifinho/],
  ['bebe', /fralda|formula infantil|leite infantil|papinha|lenco umedecido|\bnan (comfor|supreme)|aptamil|milnutri/],
  ['doces', /leite condensado|doce de leite|leite ninho.*(bolo|trufa)/],
  ['matinais', /leite em po|cafe (soluvel|torrado|em capsula|em graos)|achocolatado|cereal matinal|granola|aveia em/],
  ['mercearia', /leite de coco|molho (de )?tomate|extrato (de )?tomate|molho ingles|molho shoyu|maionese|ketchup|mostarda|azeitona|palmito|atum|sardinha em|milho verde em conserva|ervilha em conserva|creme de cebola/],
  ['bebidas', /suco (de|em)|refrigerante|agua mineral|agua com gas|cerveja|energetico|isotonico/],
  ['limpeza', /lava.?loucas|lava.?roupas|sabao (em po|liquido|de coco)|agua sanitaria|amaciante/],
  ['higiene', /papel higienico|creme dental|escova de dente|sabonete|shampoo|condicionador/],
];

// Marcas de produto processado. Servem para nao confundir o legume com o que
// e feito dele: "molho de tomate" e "batata frita congelada" trazem a palavra
// do hortifruti no nome, e a regra de hortifruti disparava antes das outras.
const PROCESSADO = /molho|extrato|polpa|suco|sopa|caldo|pure|geleia|chips|palha|frita|congelad|desidratad|em po\b|passas?\b|seco\b|conserva|enlatad|refogad/;

// Congelado ganha de basico de mercearia -- mas so quando a palavra indica o
// produto, e nao um sabor: "Molho de Tomate sabor Pizza" nao e congelado.
const CONGELADO = /congelad|nuggets|empanad|sorvete|\bacai\b|batata frita|pizza (pronta|inteira)|lasanha (pronta|tradicional)/;

// Basico de mercearia. Vem antes da categoria que a loja informou: o feijao a
// vacuo que o mercado guarda no hortifruti continua sendo procurado na
// mercearia.
const BASICO = /\b(arroz|feijao|macarrao|espaguete|acucar|farinha|fuba|amido|azeite|vinagre)\b|oleo de soja|sal refinado/;

export function classify(rawCategory, productName) {
  const cat = fold(rawCategory);
  const name = fold(productName);
  for (const [key, re] of ESPECIFICOS) if (re.test(name)) return key;
  if (BASICO.test(name) && !CONGELADO.test(name)) return 'mercearia';
  for (const [key, re] of RULES) if (re.test(cat)) return key;
  for (const [key, re] of RULES) {
    if (key === 'hortifruti' && PROCESSADO.test(name)) continue;
    if (re.test(name)) return key;
  }
  return 'outros';
}
