/**
 * O que se compra de verdade, agrupado por corredor.
 *
 * Serve a duas coisas: o seed inicial e o preenchimento sob demanda -- quando
 * alguem abre um corredor que ainda nao tem produto, o app usa estes termos
 * para buscar nos mercados na hora, em vez de mostrar prateleira vazia.
 */
export const TERMOS_POR_CATEGORIA = {
  hortifruti: [
    'banana', 'maca', 'laranja', 'limao', 'tomate', 'cebola', 'batata', 'alho',
    'cenoura', 'alface', 'brocolis', 'abobrinha', 'mamao', 'abacate', 'uva', 'ovos',
  ],
  // Padaria tinha seis termos e 36 produtos. Um corredor enche com o que se
  // procura nele, e nao com o que caberia -- entao aqui entra o que se compra
  // de padaria de verdade, do pao do dia ao que se leva para o cafe.
  padaria: [
    'pao frances', 'pao de forma', 'pao integral', 'pao de queijo', 'pao sirio',
    'pao de hamburguer', 'pao de hot dog', 'bisnaguinha', 'baguete', 'ciabatta',
    'brioche', 'croissant', 'torrada', 'bolo', 'bolo de cenoura', 'rosca',
    'sonho', 'panetone', 'broa de milho', 'pao doce', 'pao sem gluten',
  ],
  // Carnes tinha 1 produto no catalogo medido, com doze termos. Corte que se
  // compra por peso costuma vir sem codigo de barras e com nome curto, entao
  // vale variar o jeito de pedir.
  acougue: [
    'file de frango', 'peito de frango', 'coxa de frango', 'sobrecoxa', 'frango inteiro',
    'carne moida', 'picanha', 'alcatra', 'contra file', 'coxao mole', 'patinho',
    'costela bovina', 'maminha', 'fraldinha', 'cupim', 'acem',
    'linguica toscana', 'linguica calabresa', 'bacon', 'salsicha', 'pernil',
    'lombo suino', 'costelinha suina', 'file de tilapia', 'salmao', 'camarao',
    'sardinha fresca', 'merluza', 'carne para churrasco',
  ],
  frios: [
    'queijo mussarela', 'queijo prato', 'queijo minas', 'queijo coalho', 'queijo parmesao',
    'queijo cheddar', 'queijo provolone', 'queijo colonial', 'queijo ralado',
    'requeijao', 'cream cheese', 'catupiry', 'ricota',
    'presunto', 'mortadela', 'salame', 'peito de peru', 'apresuntado', 'copa',
    'blanquet de peru', 'salaminho', 'lombo canadense',
  ],
  laticinios: [
    'leite integral', 'leite desnatado', 'leite semidesnatado', 'leite sem lactose',
    'leite condensado', 'iogurte natural', 'iogurte grego', 'iogurte de morango',
    'iogurte integral', 'bebida lactea', 'coalhada',
    'manteiga', 'manteiga com sal', 'margarina', 'creme de leite', 'nata', 'chantilly',
  ],
  matinais: [
    'cafe', 'cafe soluvel', 'achocolatado em po', 'leite em po', 'aveia', 'granola',
    'cereal matinal', 'geleia', 'mel', 'cha', 'adocante', 'capuccino',
  ],
  // Sem massas, molhos, temperos e oleos, que agora tem corredor proprio.
  mercearia: [
    'arroz', 'arroz parboilizado', 'arroz integral', 'feijao carioca', 'feijao preto',
    'lentilha', 'grao de bico', 'quinoa', 'canjica', 'milho para pipoca',
    'acucar refinado', 'acucar demerara', 'adocante', 'farinha de trigo', 'farinha de mandioca',
    'fuba', 'amido de milho', 'polvilho', 'farinha de rosca', 'farofa pronta',
    'atum em lata', 'sardinha em lata', 'milho verde lata', 'ervilha lata', 'azeitona',
    'palmito', 'seleta de legumes', 'creme de cebola', 'sopa instantanea', 'cuscuz',
    'leite de coco', 'coco ralado', 'leite de castanha', 'proteina de soja',
  ],
  massas: [
    'macarrao espaguete', 'macarrao parafuso', 'macarrao penne', 'macarrao talharim',
    'macarrao ninho', 'macarrao integral', 'macarrao sem gluten', 'macarrao instantaneo',
    'lasanha massa', 'massa para pastel', 'massa fresca', 'nhoque', 'canelone',
    'macarrao de arroz', 'macarrao conchinha', 'macarrao ave maria', 'massa de pizza',
  ],
  molhos: [
    'molho de tomate', 'extrato de tomate', 'polpa de tomate', 'tomate pelado',
    'molho para massas', 'molho bolonhesa', 'maionese', 'ketchup', 'mostarda',
    'molho barbecue', 'molho shoyu', 'molho de pimenta', 'molho ingles',
    'molho para salada', 'molho de alho', 'molho branco',
  ],
  temperos: [
    'sal refinado', 'sal grosso', 'tempero completo', 'caldo de galinha', 'caldo de carne',
    'oregano', 'pimenta do reino', 'colorau', 'cominho', 'acafrao', 'curry', 'paprica',
    'canela em po', 'folha de louro', 'alho e sal', 'cebola em po', 'ervas finas',
    'manjericao desidratado', 'noz moscada', 'tempero para churrasco',
  ],
  oleos: [
    'oleo de soja', 'oleo de girassol', 'oleo de canola', 'oleo de milho', 'oleo de coco',
    'azeite de oliva', 'azeite extra virgem', 'azeite portugues',
    'vinagre de alcool', 'vinagre de maca', 'vinagre balsamico', 'vinagre de vinho',
    'aceto balsamico', 'banha de porco',
  ],
  doces: [
    'chocolate', 'chocolate ao leite', 'chocolate meio amargo', 'bombom', 'caixa de bombom',
    'biscoito recheado', 'biscoito maria', 'bolacha agua e sal', 'biscoito de polvilho',
    'wafer', 'cookie', 'barra de cereal', 'paçoca', 'pé de moleque',
    'salgadinho', 'batata chips', 'amendoim', 'castanha de caju', 'castanha do para',
    'pipoca de microondas', 'gelatina', 'pudim', 'leite condensado', 'doce de leite',
    'bala', 'chiclete', 'pirulito', 'marshmallow', 'geleia de mocoto',
  ],
  congelados: [
    'pizza congelada', 'nuggets', 'batata frita congelada', 'sorvete', 'acai',
    'polpa de fruta', 'hamburguer congelado', 'lasanha congelada',
  ],
  bebidas: [
    'agua mineral', 'refrigerante', 'suco de laranja', 'cerveja', 'vinho tinto',
    'energetico', 'agua de coco', 'suco de uva', 'agua tonica',
  ],
  limpeza: [
    'detergente', 'sabao em po', 'sabao liquido', 'amaciante', 'agua sanitaria',
    'desinfetante', 'limpador multiuso', 'esponja de aco', 'esponja de louca',
    'saco de lixo', 'lustra moveis', 'inseticida', 'papel toalha', 'alcool',
  ],
  higiene: [
    'papel higienico', 'shampoo', 'condicionador', 'sabonete', 'creme dental',
    'escova de dente', 'fio dental', 'desodorante', 'absorvente', 'aparelho de barbear',
    'algodao', 'hidratante corporal', 'protetor solar', 'cotonete', 'shampoo infantil',
  ],
  bebe: ['fralda', 'lenco umedecido', 'papinha', 'formula infantil', 'pomada para assadura', 'shampoo bebe'],
  pet: ['racao para cachorro', 'racao para gato', 'areia higienica', 'petisco para cachorro', 'sache para gato', 'osso para cachorro'],
  casa: [
    'guardanapo', 'papel aluminio', 'filme plastico', 'pilha aa', 'lampada led',
    'carvao', 'pote hermetico', 'vassoura', 'rodo', 'copo',
  ],
};

/** Lista achatada, na ordem dos corredores, para o seed completo. */
export const TODOS_OS_TERMOS = Object.values(TERMOS_POR_CATEGORIA).flat();

export function termosDe(categoria) {
  return TERMOS_POR_CATEGORIA[categoria] || [];
}
