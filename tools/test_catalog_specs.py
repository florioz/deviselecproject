import unittest
from prepare_catalog_specs import derive


class CatalogSpecificationRulesTest(unittest.TestCase):
    def test_reference_numbers_are_not_electrical_ratings(self):
        facts = derive({'label': 'Prise 2P+T blanche - PC39133A'})
        self.assertNotIn('amps', facts)

    def test_conflicting_values_remain_unknown(self):
        facts = derive({'label': 'Prise 2P+T 16A / 32A'})
        self.assertNotIn('amps', facts)

    def test_explicit_rated_values_and_complete_assembly_take_priority(self):
        facts = derive({'label': 'Prise 2P+T USB blanc complet'}, 'Chargeur USB 1.5A', {
            'Tension - Intensite': '250V - 16A', 'Type appareillage': 'Mecanisme',
            'Assemblage': 'Complet', 'Bornes automatiques': 'Non',
        })
        self.assertEqual(facts['type'], 'socket-usb')
        self.assertEqual(facts['amps'], '16')
        self.assertEqual(facts['volts'], '250')
        self.assertEqual(facts['assembly'], 'complete')
        self.assertEqual(facts['connection'], 'non-automatic')

    def test_covers_and_two_color_products_are_distinct(self):
        facts = derive({'label': 'Enjoliveur prise 2P+T blanc et noir'})
        self.assertEqual(facts['type'], 'socket-cover')
        self.assertEqual(facts['color'], 'blanc / noir')

    def test_multiple_mounting_options_remain_unknown(self):
        facts = derive({'label': 'Prise 2P+T'}, attributes={'Pose': 'Encastrée ou saillie'})
        self.assertNotIn('mount', facts)

    def test_packs_and_multiple_sockets_remain_distinct_from_single_items(self):
        self.assertEqual(derive({'label':'Prise 2P+T'})['pack'], '1')
        self.assertEqual(derive({'label':'Prise 2P+T - Lot 14+1 gratuit'})['pack'], '15')
        self.assertEqual(derive({'label':'Prise 2P+T - Lot de 50'})['pack'], '50')
        self.assertEqual(derive({'label':'Double prise de courant 2P+T'})['outlets'], '2')


if __name__ == '__main__':
    unittest.main()
