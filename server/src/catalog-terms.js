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
  padaria: ['pao frances', 'pao de forma', 'pao de queijo', 'bolo', 'bisnaguinha', 'torrada'],
  acougue: [
    'file de frango', 'coxa de frango', 'carne moida', 'picanha', 'alcatra', 'costela',
    'linguica toscana', 'bacon', 'salsicha', 'file de tilapia', 'camarao', 'pernil',
  ],
  frios: [
    'leite integral', 'leite desnatado', 'iogurte natural', 'iogurte grego', 'requeijao',
    'manteiga', 'margarina', 'queijo mussarela', 'queijo prato', 'presunto', 'mortadela',
    'creme de leite', 'queijo parmesao',
  ],
  matinais: [
    'cafe', 'cafe soluvel', 'achocolatado em po', 'leite em po', 'aveia', 'granola',
    'cereal matinal', 'geleia', 'mel', 'cha', 'adocante', 'capuccino',
  ],
  mercearia: [
    'arroz', 'feijao carioca', 'feijao preto', 'macarrao espaguete', 'macarrao parafuso',
    'oleo de soja', 'azeite de oliva', 'acucar refinado', 'sal refinado', 'farinha de trigo',
    'molho de tomate', 'extrato de tomate', 'vinagre', 'maionese', 'ketchup', 'mostarda',
    'atum em lata', 'sardinha em lata', 'milho verde lata', 'ervilha lata', 'azeitona',
    'leite de coco', 'fuba', 'amido de milho', 'caldo de galinha', 'palmito',
  ],
  doces: [
    'chocolate', 'biscoito recheado', 'bolacha agua e sal', 'salgadinho', 'amendoim',
    'castanha de caju', 'pipoca de microondas', 'gelatina', 'leite condensado', 'bala',
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
