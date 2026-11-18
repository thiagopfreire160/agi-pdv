# Registro do processo clean room

O agi pdv foi escrito do zero. A ideia de produto veio do Hórus PDV, de Flávio Oliveira (licença MIT), mas nenhuma linha de código, texto de interface ou elemento visual dele foi copiada. Este arquivo registra como a separação foi feita.

## Etapas

| Quando (15/11/2026, UTC-3) | O quê | Quem viu o código do Hórus |
|---|---|---|
| 01:25 | Autor da especificação (agente 1) lê o Hórus e escreve `docs/especificacao.md`, só com comportamento e regras de negócio | Agente 1 |
| 01:31 | Revisão da especificação: verificação automática de sobreposição de texto com o original (nenhuma sequência de 6 palavras em comum; com 5 palavras, só termos genéricos do domínio, como "fiscal NFC-e / NF-e") e de identificadores de código (nenhum) | Revisor |
| 01:32 | Código do Hórus lacrado num arquivo fora da área de trabalho e removido do ambiente | — |
| depois de 01:32 | Implementação da API e do front por agentes novos, que receberam só a especificação, o design system e o logo | Ninguém |

SHA-256 da especificação entregue aos implementadores:
`a139b6b7910df68522d322f9893afcdcca3971086c5f5a3c764c8be4a8a156c6`

## O que veio de onde

- **Do Hórus (como ideia, nunca como texto):** a lista de módulos de um PDV para pequeno comércio e as regras de negócio descritas com outras palavras em `docs/especificacao.md`.
- **Novo:** todo o código, a stack (Node/Fastify + PostgreSQL no lugar de .NET + SQL Server), o nome, o logo, o design system, os textos da interface e a documentação.

## Regra para atualizações futuras

Não abra o código do Hórus para "ver como ele fez". Se precisar de um comportamento novo, escreva-o primeiro na especificação, com suas palavras, e implemente a partir dela.

## Varredura final (15/11/2026, 03:35)

Todo o código, a documentação e a landing do agi pdv foram comparados com o original em sequências de 8 palavras normalizadas, por um revisor, numa cópia temporária apagada logo depois. As coincidências encontradas são de código-padrão que qualquer projeto com a mesma tecnologia tem: modelo de `index.html` do Vite, sequências de classes do Tailwind, importações do React, reset de CSS, lista de UFs, pesos do dígito verificador de CPF e CNPJ, opções de formatação de data do JavaScript e o link de acessibilidade "Pular para o conteúdo". Nenhum texto de interface, regra escrita ou trecho de lógica de negócio do original aparece no agi pdv. A única frase de validação coincidente ("o preço de venda deve ser maior que zero") foi reescrita por precaução.

Além deste registro, o nome do original só aparece no crédito do README, da landing e da skill, e na linha de procedência da especificação.
