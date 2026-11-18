# research-collaboration

[English](./README.en.md)

一緒に研究を進める相手を募るリポジトリです。
申し出は、GitHub の issue の様式で受けます。
料金は取らず、対価も払いません。
この協力は、雇用ではありません。

## 運営者

運営者は、根本卓哉（Takuya Nemoto）です。
ORCID iD は [0009-0000-1406-0547](https://orcid.org/0009-0000-1406-0547) です。
GitHub のアカウントは [cpsbvbng26-dotcom](https://github.com/cpsbvbng26-dotcom) です。
運営者が公開したものは、どれも査読を受けていない稿と道具です。

## 主題

一緒に進めたい主題は、[TOPICS.md](./TOPICS.md) にあります。
どれも、運営者のほかのリポジトリに書いてある事実から引いています。

## 申し出

[共同研究の申し出](https://github.com/cpsbvbng26-dotcom/research-collaboration/issues/new?template=collaboration.yml)の様式で受けます。
issue は公開されます。
本名・住所・所属・連絡先と、病歴などの要配慮個人情報は、書かない形にしています。
申し出の前に、次の頁を読む形にしています。

| 頁 | 中身 |
| --- | --- |
| [協力の条件](./policies/terms.md) | 費用と対価、雇用ではないこと、任意であること、受けないもの |
| [著者と貢献](./policies/authorship.md) | 役割による表示、Claude を著者にしないこと、言語モデルの使い方の開示 |
| [ライセンス](./policies/licences.md) | 文は CC BY 4.0、コードは MIT、寄せられたものも同じ |
| [個人情報の取り扱い](./policies/privacy.md) | 集めるもの、利用の目的、言語モデルに渡すことへの同意 |
| [行動の決まり](./policies/conduct.md) | 求める振る舞いと、認めない振る舞い |
| [免責事項](./policies/disclaimer.md) | 法的な助言でも医療の助言でもないこと、どの組織とも関わらないこと |
| [削除・訂正・開示の求め](./policies/requests.md) | 求め方と、公開できない求め |
| [名称と権利](./policies/names.md) | このリポジトリの名と、権利者の知らせ |
| [法令の整理](./policies/law.md) | 引いた条文と、結論を出していないところ |

## ほかの様式

- [削除・訂正・開示の求め](https://github.com/cpsbvbng26-dotcom/research-collaboration/issues/new?template=request.yml)
- [権利者の知らせ](https://github.com/cpsbvbng26-dotcom/research-collaboration/issues/new?template=rights.yml)
- [誤りの知らせ](https://github.com/cpsbvbng26-dotcom/research-collaboration/issues/new?template=error-report.yml)
- 安全の問題は、[SECURITY.md](./SECURITY.md) の入口で受けます。

## 言語モデルの使い方

このリポジトリの頁とコードは、運営者が求め、Claude Code（Anthropic）が書きました。
Claude は著者ではありません。
issue を言語モデルに渡すのは、様式の同意の欄に印がある issue の題と本文だけです。
運営者が自分で開いた issue は、この限りではありません。

## 検査

```
node verification/check.js
node verification/check.js --break   # 検査を一つずつ壊し、落ちることを確かめる
node tools/statutes.js               # 条文と規約を取り寄せ直して比べる（要: 外への接続）
```

## ライセンス

文は [CC BY 4.0](./LICENSE)、コードは [MIT](./LICENSE-CODE) です。
