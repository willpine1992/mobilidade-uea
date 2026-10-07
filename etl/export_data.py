"""Regenera js/data.js (página pública) a partir da planilha de Mobilidades
baixada do Drive pelo ETL em DATA BASE UEA/BANCO DE DADOS GOOGLE DRIVE/raw/.

Só exporta campos autorizados para divulgação pública: colunas de
Fato_Mobilidades, Dim_Programas_Mobilidade e, de Dim_Participantes_dados
reais, apenas Nome_ABNT e Sexo_Genero. Nunca nome completo, e-mail,
telefone ou matrícula (ver README, seção Privacidade).

Uso (com o venv do ETL, que já tem openpyxl):
  "../../DATA BASE UEA/BANCO DE DADOS GOOGLE DRIVE/venv/bin/python" etl/export_data.py
"""
from __future__ import annotations

import datetime
import json
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
SOURCE_XLSM = (
    ROOT.parent.parent / "DATA BASE UEA" / "BANCO DE DADOS GOOGLE DRIVE" / "raw"
    / "Modelo_PowerBI_Mobilidades_UEA_Estrutura_Completa_ERASMUS_Atualizada.xlsm"
)
OUT = ROOT / "js" / "data.js"


def read_sheet(wb, name: str) -> list[dict]:
    rows = wb[name].iter_rows(values_only=True)
    header = next(rows)
    out = []
    for r in rows:
        if not r or r[0] in (None, ""):
            continue
        out.append(dict(zip(header, r)))
    return out


def as_int(v):
    return int(v) if isinstance(v, (int, float)) else v


def main() -> None:
    wb = openpyxl.load_workbook(SOURCE_XLSM, data_only=True, read_only=True)

    participantes = {
        p["ID_Participante"]: p for p in read_sheet(wb, "Dim_Participantes_dados reais")
    }

    rows = []
    for f in read_sheet(wb, "Fato_Mobilidades"):
        p = participantes.get(f["ID_Participante"], {})
        rows.append({
            "id": f["ID_Mobilidade"],
            "nome_abnt": p.get("Nome_ABNT"),
            "sexo": p.get("Sexo_Genero"),
            "modalidade": f["Programa_Mobilidade"],
            "edicao": f["Edicao"],
            "ano_ref": as_int(f["Ano_Referencia_Painel"]),
            "fluxo": f["Fluxo_Mobilidade"],
            "tipo": f["Tipo_Mobilidade"],
            "pais": f["Pais_Origem"],
            "iso2": f["Codigo_Pais_ISO2"],
            "iso3": f["Codigo_Pais_ISO3"],
            "continente": f["Continente_Origem"],
            "ppg_codigo": f["Codigo_PPG"],
            "ppg": f["Programa_Pos_Graduacao"],
            "programa_original": f["Programa_Original"],
            "nivel": f["Nivel_Academico"],
            "situacao": f["Situacao_Participacao"],
            "financiamento": f["Fonte_Financiamento"],
            "qualidade": f["Status_Qualidade_Dado"],
            "oficial": f["Incluir_Indicadores_Oficiais"] == "Sim",
            "recebido": f["Incluir_Recebidos"] == "Sim",
        })

    modalidades = [
        {
            "programa": m["Programa_Mobilidade"],
            "nome": m["Nome_Exibicao"],
            "fluxo": m["Fluxo_Previsto"],
            "publico": m["Publico_Alvo"],
            "status_base": m["Status_Base_Dados"],
            "qtd_atual": as_int(m["Quantidade_Registros_Atual"]),
            "possui_dados": m["Possui_Dados_Atuais"],
            "obs": m["Observacoes"],
        }
        for m in read_sheet(wb, "Dim_Programas_Mobilidade")
    ]

    hoje = datetime.date.today().isoformat()
    OUT.write_text(
        "// Dados de Fato_Mobilidades + Nome_ABNT/Sexo_Genero (Dim_Participantes_dados reais) + dimensão de modalidades.\n"
        "// Nome_ABNT (citação acadêmica) e Sexo_Genero (categoria demográfica agregada) foram autorizados\n"
        "// para divulgação pública pela UEA/PROPESP. Nenhum e-mail, telefone ou nome completo foi incluído.\n"
        "// Fonte: Modelo_PowerBI_Mobilidades_UEA_Estrutura_Completa_ERASMUS_Atualizada.xlsm (Google Drive, UEA/PROPESP).\n"
        f"// Gerado por etl/export_data.py em {hoje}.\n"
        f"const MOB_ROWS = {json.dumps(rows, ensure_ascii=False)};\n"
        "\n"
        f"const MOB_MODALIDADES = {json.dumps(modalidades, ensure_ascii=False)};\n",
        encoding="utf-8",
    )
    print(f"{len(rows)} mobilidades, {len(modalidades)} modalidades -> {OUT}")


if __name__ == "__main__":
    main()
