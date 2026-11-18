# Testar a impressora do recibo

Leva uns 10 minutos, com a impressora térmica ligada e instalada no Windows.

1. Instale o driver da impressora e imprima a página de teste do Windows. Se essa página não sair, o problema está no driver, não no agi pdv.
2. No Windows, em **Impressoras e scanners**, abra a impressora, vá em **Preferências de impressão** e escolha o papel de 80 mm (ou 58 mm) com o comprimento contínuo ou "rolo".
3. No agi pdv, em **Configurações → Recibo**, escolha o mesmo tamanho de papel.
4. Abra o caixa e faça uma venda de teste. Na janela de impressão do navegador:
   - escolha a impressora térmica;
   - **Margens:** nenhuma;
   - desmarque **Cabeçalhos e rodapés**;
   - **Escala:** 100%.
5. Confira no papel:
   - o nome e o CNPJ da loja saem inteiros, sem cortar na direita;
   - os valores ficam alinhados à direita;
   - o código de barras do recibo é lido pelo leitor do caixa;
   - o papel corta logo depois do rodapé, sem sobra grande em branco.
6. Repita em **Vendas → abrir a venda → Reimprimir** para conferir a 2ª via.

Se algo sair cortado, ajuste a escala para 95% e teste de novo. Se mesmo assim não ficar bom, anote o modelo da impressora e o que saiu errado, e leve isso para a próxima atualização.

Quando estiver tudo certo, ligue **Imprimir sozinho ao finalizar** em Configurações → Recibo, se a loja preferir.
