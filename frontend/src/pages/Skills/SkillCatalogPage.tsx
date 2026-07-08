import { useEffect, useState } from 'react';
import { Card, Table, Tag, Button, Input, InputNumber, Switch, Select, Space, Modal, Form, Popconfirm, message } from 'antd';
import axios from 'axios';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import {
  fetchAllSkills,
  createSkill,
  updateSkillCatalogEntry,
  deleteSkillCatalogEntry,
} from '../../services/skillService';
import { fetchAllSkillCategories } from '../../services/skillCategoryService';
import { Skill } from '../../types/skill';
import { SkillCategory } from '../../types/skillCategory';
import { CompanyNeedLevel } from '../../types/common';

function errorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && typeof err.response?.data?.message === 'string') {
    return err.response.data.message;
  }
  return fallback;
}

const COMPANY_NEED_TAG: Record<CompanyNeedLevel, { color: string; label: string }> = {
  [CompanyNeedLevel.VERY_NEEDED]: { color: 'gold', label: 'Very Needed' },
  [CompanyNeedLevel.NORMALLY]: { color: 'blue', label: 'Normally' },
  [CompanyNeedLevel.DONT_NEED]: { color: 'default', label: "Don't Need" },
};

const COMPANY_NEED_OPTIONS = [
  { value: CompanyNeedLevel.VERY_NEEDED, label: 'Very Needed' },
  { value: CompanyNeedLevel.NORMALLY, label: 'Normally' },
  { value: CompanyNeedLevel.DONT_NEED, label: "Don't Need" },
];

export function SkillCatalogPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [categories, setCategories] = useState<SkillCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const loadSkills = async () => {
    setLoading(true);
    try {
      setSkills(await fetchAllSkills());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSkills();
    fetchAllSkillCategories().then(setCategories);
  }, []);

  const openCreateModal = () => {
    setEditingSkill(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEditModal = (skill: Skill) => {
    setEditingSkill(skill);
    form.setFieldsValue({
      name: skill.name,
      category: skill.category ?? undefined,
      isKeySkill: skill.isKeySkill,
      keySkillMultiplier: skill.keySkillMultiplier,
      companyNeedLevel: skill.companyNeedLevel,
      isFoundational: skill.isFoundational,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editingSkill) {
        await updateSkillCatalogEntry(editingSkill.id, values);
        message.success('Skill updated');
      } else {
        await createSkill(values);
        message.success('Skill created');
      }
      setModalOpen(false);
      loadSkills();
    } catch (err) {
      message.error(errorMessage(err, 'Failed to save skill'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (skill: Skill) => {
    try {
      await deleteSkillCatalogEntry(skill.id);
      message.success('Skill deleted');
      loadSkills();
    } catch (err) {
      message.error(errorMessage(err, 'Failed to delete skill'));
    }
  };

  return (
    <Card
      title="Skill Catalog"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
          Add Skill
        </Button>
      }
    >
      <Table
        rowKey="id"
        loading={loading}
        dataSource={skills}
        columns={[
          { title: 'Name', dataIndex: 'name' },
          { title: 'Category', dataIndex: 'category', render: (v: string | null) => v ?? '—' },
          {
            title: 'Key Skill',
            render: (_, record: Skill) =>
              record.isKeySkill ? <Tag color="blue">Key ×{record.keySkillMultiplier}</Tag> : '—',
          },
          {
            title: 'Company Needed',
            dataIndex: 'companyNeedLevel',
            render: (v: CompanyNeedLevel) => {
              const { color, label } = COMPANY_NEED_TAG[v];
              return <Tag color={color}>{label}</Tag>;
            },
          },
          {
            title: 'Foundational',
            dataIndex: 'isFoundational',
            render: (v: boolean) => (v ? <Tag color="purple">Foundational</Tag> : '—'),
          },
          {
            title: 'Actions',
            render: (_, record: Skill) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
                  Edit
                </Button>
                <Popconfirm
                  title="Delete this skill?"
                  description="Blocked if any employee still has a skill-history entry for it."
                  onConfirm={() => handleDelete(record)}
                >
                  <Button size="small" danger icon={<DeleteOutlined />}>
                    Delete
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={editingSkill ? 'Edit skill' : 'Add skill'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={saving}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="category"
            label="Category"
            tooltip="Managed on the Skill Categories page."
          >
            <Select
              allowClear
              placeholder="Uncategorized"
              options={categories.map((c) => ({ value: c.name, label: c.name }))}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item
            name="companyNeedLevel"
            label="Company needed"
            initialValue={CompanyNeedLevel.NORMALLY}
            tooltip="How much the company currently needs this skill."
          >
            <Select options={COMPANY_NEED_OPTIONS} />
          </Form.Item>
          <Form.Item
            name="isFoundational"
            label="Foundational"
            valuePropName="checked"
            tooltip="A fundamental/prerequisite skill rather than a specialization."
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="isKeySkill"
            label="Key skill"
            valuePropName="checked"
            tooltip="Key skills (e.g. English) receive a score multiplier in evaluations."
          >
            <Switch />
          </Form.Item>
          <Form.Item name="keySkillMultiplier" label="Key skill multiplier" initialValue={1}>
            <InputNumber min={0} step={0.1} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
