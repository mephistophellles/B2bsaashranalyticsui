from app.services.essi import block_percentage, essi_from_blocks


def test_essi_from_block_sums_uses_methodology_maximum() -> None:
    assert essi_from_blocks([25, 25, 25, 25, 25]) == 100.0
    assert essi_from_blocks([15, 15, 15, 15, 15]) == 60.0


def test_block_percentage_is_derived_from_block_sum() -> None:
    assert block_percentage(25) == 100.0
    assert block_percentage(5) == 20.0
