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
  // Frios e o que se corta no balcao -- queijo, presunto, mortadela. Leite,
  // iogurte e manteiga sao outra parada da compra, e por isso outra placa:
  // estavam juntos num corredor chamado "Frios e Laticínios" que ninguem
  // procura assim.
  { key: 'frios', label: 'Frios e Queijos', emoji: '🧀', order: 4 },
  { key: 'laticinios', label: 'Laticínios', emoji: '🥛', order: 5 },
  { key: 'matinais', label: 'Matinais', emoji: '☕', order: 6 },
  { key: 'mercearia', label: 'Mercearia', emoji: '🍚', order: 7 },
  // Mercearia era 57% do catalogo -- 860 produtos de 1506 -- e um corredor
  // desse tamanho nao e um corredor, e um deposito. Massas, molhos, temperos e
  // oleos saem dela: sao quatro viagens diferentes a loja, e cada uma ja tinha
  // produto suficiente para ter placa propria.
  { key: 'massas', label: 'Massas', emoji: '🍝', order: 8 },
  { key: 'molhos', label: 'Molhos', emoji: '🍅', order: 9 },
  { key: 'temperos', label: 'Temperos', emoji: '🧂', order: 10 },
  { key: 'oleos', label: 'Óleos e Vinagres', emoji: '🫒', order: 11 },
  { key: 'doces', label: 'Doces e Snacks', emoji: '🍫', order: 12 },
  { key: 'congelados', label: 'Congelados', emoji: '🧊', order: 13 },
  { key: 'bebidas', label: 'Bebidas', emoji: '🧴', order: 14 },
  { key: 'limpeza', label: 'Limpeza', emoji: '🧽', order: 15 },
  { key: 'higiene', label: 'Higiene e Beleza', emoji: '🧼', order: 16 },
  { key: 'bebe', label: 'Bebê', emoji: '🍼', order: 17 },
  { key: 'pet', label: 'Pet', emoji: '🐾', order: 18 },
  { key: 'casa', label: 'Casa e Utilidades', emoji: '🏠', order: 19 },
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
  ['laticinios', /laticinios|\bleite\b|leite integral|leite desnatado|iogurte|bebida lactea|manteiga|margarina|creme de leite|\bnata\b|coalhada|\bwhey\b natural/],
  ['frios', /frios|embutidos|queijo|presunto|mortadela|salame|apresuntado|peito de peru|blanquet|copa\b|salaminho|mussarela|parmesao|ricota|catupiry|requeijao|cream cheese|provolone|gorgonzola|\bbrie\b|\bcolonial\b|queijo ralado/],
  ['matinais', /matinais|cafe\b|cafes|capuccino|cappuccino|cereal|cereais|granola|aveia|achocolatado|nescau|toddy|leite em po|ninho|geleia|mel\b|torrada|biscoito de agua|cha\b|chas\b|adocante/],
  ['congelados', /congelad|sorvete|acai|pizza congelada|nuggets|hamburguer congelado|batata frita congelada|polpa de fruta|empanado|lasanha congelada|gelo\b/],
  ['bebidas', /bebidas|refrigerante|cerveja|vinho|suco|agua mineral|energetico|isotonico|whisky|vodka|cachaca|gin\b|espumante|destilado|tonica|guarana|coca.?cola|pepsi|heineken|brahma|skol|antarctica/],
  ['doces', /doces|snacks|passas?\b|chocolate|bombom|bala\b|chiclete|pirulito|salgadinho|batata chips|biscoito|bolacha|wafer|amendoim|castanha|pipoca|pacoca|brigadeiro|sobremesa|gelatina|pudim|leite condensado|doce de leite/],
  // Antes da mercearia, senao a regra generica dela engole os quatro.
  ['massas', /\bmassas?\b|macarrao|espaguete|spaghetti|talharim|linguine|fettucc?ine|\bpenne\b|parafuso|fusilli|conchiglione|rigatoni|farfalle|nhoque|lasanha|canelone|rondelli|\bmiojo\b|\blamen\b|\bramen\b/],
  ['molhos', /\bmolhos?\b|molho de tomate|extrato de tomate|polpa de tomate|tomate pelado|passata|maionese|ketchup|catchup|mostarda|barbecue|\bshoyu\b|molho ingles|\btarê?\b|worcester/],
  ['temperos', /temperos?|condimento|\bsal\b|sal refinado|colorau|oregano|cominho|pimenta do reino|alho e sal|\bcaldo\b|folha de louro|acafrao|\bcurry\b|\bpaprica\b|noz.?moscada|manjericao|ervas finas/],
  ['oleos', /\boleos?\b|azeite|vinagre|\baceto\b|balsamico|banha|gordura de coco/],
  ['mercearia', /mercearia|alimentos basicos|arroz|feijao|acucar|farinha|fuba|amido|conservas|atum|sardinha|milho verde|ervilha|azeitona|palmito|leite de coco|sopa\b|proteina de soja|granel|enlatado|mantimento/],
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
  // O nome manda sobre a gondola: o mercado guarda congelado junto de frios e
  // manda a categoria "Frios e Congelados" para os dois. Congelados tinha tres
  // produtos no catalogo medido por causa disso.
  ['congelados', /congelad[ao]s?|\bsorvete\b|\bacai\b|\bnuggets\b|empanad[ao]|\bpicole\b/],
  ['doces', /leite condensado|doce de leite|leite ninho.*(bolo|trufa)/],
  ['matinais', /leite em po|cafe (soluvel|torrado|em capsula|em graos)|achocolatado|cereal matinal|granola|aveia em/],
  // A lata ganha do molho em que o peixe nada: "Sardinha ao Molho de Tomate" e
  // peixe em conserva, e sem esta linha ela ia para o corredor de molhos --
  // dez produtos foram assim na medicao. O veto protege o hortifruti: ervilha
  // e milho tambem se vendem frescos, e a primeira versao desta linha roubou
  // oito produtos de la.
  ['mercearia', /\batum\b|\bsardinha\b|anchova|azeitona|palmito|milho.?verde|\bervilha\b|seleta de legumes|leite de coco|creme de cebola/,
    /fresc[ao]|\bgranel\b|congelad|\bespiga\b|na espiga|\bbandeja\b|\bunidade\b|\bpencas?\b/],
  // Caldo ganha do molho: "Caldo de Carne" nao e molho, e o mercado as vezes
  // guarda os dois na mesma gondola e manda "Molhos e Condimentos" para ambos.
  // O veto e por causa de "Caldo Bom", que e marca de farinha e de fuba.
  ['temperos', /\bcaldo\b|\bsazon\b|tempero (completo|pronto|para)|\bcolorau\b|\boregano\b/,
    /caldo bom|farinha|\bfuba\b|feijoadinha|\bsopa\b|snack|biscoito|bruschette/],
  // O veto e para o sabor: "Batata Rústica sabor Ketchup" e salgadinho, e
  // "Salgadinho sabor Maionese" tambem. O nome traz a palavra do molho sem o
  // produto ser molho.
  ['molhos', /molho (de )?tomate|extrato (de )?tomate|polpa (de )?tomate|molho ingles|molho shoyu|molho de pimenta|maionese|ketchup|mostarda|molho barbecue/,
    /\bbatata\b|salgadinho|\bsnack\b|\bchips\b|biscoito|pipoca|\bcracker\b|torresmo|amendoim/],
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

/**
 * O basico, e o corredor de cada um.
 *
 * Vem antes da categoria que a loja informou, porque cada mercado guarda o
 * essencial num lugar diferente: o feijao a vacuo que um poe no hortifruti
 * continua sendo procurado na mercearia.
 *
 * Era uma regra so, que devolvia "mercearia" para tudo -- e por isso macarrao,
 * azeite e sal refinado iam para a mercearia mesmo depois de massas, oleos e
 * temperos virarem corredores. Agora cada basico diz para onde vai.
 */
const BASICOS = [
  ['massas', /\b(macarrao|espaguete|spaghetti|talharim|linguine)\b/],
  ['oleos', /\b(azeite|vinagre)\b|oleo de soja|oleo de girassol|oleo de canola/],
  ['temperos', /sal refinado|\bsal grosso\b/],
  ['mercearia', /\b(arroz|feijao|acucar|farinha|fuba|amido)\b/],
];

/**
 * O que tem palavra de mercearia no nome e nao e mercearia.
 *
 * O atalho do BASICO existe para o essencial nao depender da categoria que o
 * mercado manda, e isso e bom -- mas ele atropelava: "Biscoito de Arroz" e
 * "Snack de Arroz" tem "arroz" no nome e iam para a mercearia, onde ficavam
 * sem tipo nenhum, atrapalhando o corredor. Sao 38 produtos assim no catalogo
 * medido, quase todos biscoito e snack.
 *
 * O mesmo raciocinio dos vetos de subcategoria: a palavra esta la, o produto e
 * outro. Vetado aqui, ele desce para as regras normais e cai em Doces.
 */
const NAO_BASICO = /biscoito|bolacha|\bsnack\b|cracker|salgadinho|\bchips\b|wafer|\bbarra de\b|bebida de (arroz|amendoas|aveia|soja)|leite de (arroz|amendoas|aveia)|iogurte|suplemento|whey|creme de avela/;

export function classify(rawCategory, productName) {
  const cat = fold(rawCategory);
  const name = fold(productName);
  // O veto e opcional: existe para a palavra que aparece no nome sem ser o
  // produto ("Caldo Bom" e marca, "Ervilha Fresca" e hortifruti).
  for (const [key, re, veto] of ESPECIFICOS) if (re.test(name) && !(veto && veto.test(name))) return key;
  if (!CONGELADO.test(name) && !NAO_BASICO.test(name)) {
    for (const [key, re] of BASICOS) if (re.test(name)) return key;
  }
  for (const [key, re] of RULES) if (re.test(cat)) return key;
  for (const [key, re] of RULES) {
    if (key === 'hortifruti' && PROCESSADO.test(name)) continue;
    if (re.test(name)) return key;
  }
  return 'outros';
}
