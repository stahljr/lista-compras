import { assinaturaDe } from '../src/unificar.js';

/**
 * As armadilhas da uniao de produtos repetidos.
 *
 * Cada linha aqui e um caso que a primeira versao da regra errou, ou que ela
 * quase errou. O teste existe para que a proxima mexida na lista de palavras
 * ignoradas nao desfaca isto em silencio -- foi assim que "Amido Maizena 200g"
 * chegou a ser considerado o mesmo produto que "Leve 200g Pague 150g".
 *
 * Roda com: node server/test/unificar.test.mjs
 */

const casos = [
  ['MESMO', { name: 'Arroz Tio João 1kg - Branco', brand: 'Tio João', size_label: '1 kg' },
             { name: 'Arroz Branco TIO JOÃO 1kg', brand: 'TIO JOÃO', size_label: '1 kg' }],
  ['MESMO', { name: 'Molho de Tomate Salsaretti 500g - Basílico', brand: 'Salsaretti', size_label: '500 g' },
             { name: 'Molho de Tomate SALSARETTI Basílico 500g', brand: 'SALSARETTI', size_label: '500 g' }],
  ['DIFERENTE', { name: 'Café Solúvel Nescafé Gold Intensidade 9 Sachet 40g', brand: 'Nescafé', size_label: '40 g' },
                 { name: 'Café Solúvel NESCAFE GOLD Intensidade 6 Sachet 40g', brand: 'NESCAFE', size_label: '40 g' }],
  ['DIFERENTE', { name: 'Amido de Milho Maizena 200g', brand: 'Maizena', size_label: '200 g' },
                 { name: 'Amido de Milho MAIZENA Leve 200g Pague 150g', brand: 'MAIZENA', size_label: '200 g' }],
  ['DIFERENTE', { name: 'Leite Integral Piracanjuba 1L sem lactose', brand: 'Piracanjuba', size_label: '1 L' },
                 { name: 'Leite Integral Piracanjuba 1L com lactose', brand: 'Piracanjuba', size_label: '1 L' }],
  ['DIFERENTE', { name: 'Detergente Líquido Ypê Neutro 500ml', brand: 'Ypê', size_label: '500 ml' },
                 { name: 'Detergente Líquido Ypê Coco 500ml', brand: 'Ypê', size_label: '500 ml' }],
  ['DIFERENTE', { name: 'Arroz Tio João Branco 1kg', brand: 'Tio João', size_label: '1 kg' },
                 { name: 'Arroz Tio João Branco 2kg', brand: 'Tio João', size_label: '2 kg' }],
];

let falhas = 0;
for (const [esperado, a, b] of casos) {
  const iguais = assinaturaDe(a) === assinaturaDe(b);
  const ok = esperado === 'MESMO' ? iguais : !iguais;
  if (!ok) falhas++;
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${esperado.padEnd(10)} ${a.name.slice(0, 40)}`);
  if (!ok) console.log(`        vs ${b.name.slice(0, 40)}\n        assinaturas: ${assinaturaDe(a)} | ${assinaturaDe(b)}`);
}
console.log(falhas ? `\n${falhas} FALHARAM` : '\ntodas passaram');
process.exit(falhas ? 1 : 0);
