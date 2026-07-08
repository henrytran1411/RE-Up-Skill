import { useEffect, useState } from 'react';
import { Card, Table, Tag, Button, Input, InputNumber, Space, Modal, Form, Popconfirm, message } from 'antd';
import axios from 'axios';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import {
  fetchAllSkillCategories,
  createSkillCategory,
  updateSkillCategory,
  deleteSkillCategory,
} from '../../services/skillCategoryService';
import { SkillCategory } from '../../types/skillCategory';

const PRIORITY_COLORS: Record<number, string> = { 1: 'default', 2: 'blue', 3: 'orange', 4: 'red' };

function errorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && typeof err.response?.data?.message === 'string') {
    return err.response.data.message;
  }
  return fallback;
}

export function SkillCategoryPage() {
  const [categories, setCategories] = useState<SkillCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<SkillCategory | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const loadCategories = async () => {
    setLoading(true);
    try {
      setCategories(await fetchAllSkillCategories());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const openCreateModal = () => {
    setEditingCategory(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEditModal = (category: SkillCategory) => {
    setEditingCategory(category);
    form.setFieldsValue({
      name: category.name,
      description: category.description ?? undefined,
      primaryWeight: category.primaryWeight,
      secondaryWeight: category.secondaryWeight,
      priority: category.priority,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editingCategory) {
        await updateSkillCategory(editingCategory.id, values);
        message.success('Skill category updated');
      } else {
        await createSkillCategory(values);
        message.success('Skill category created');
      }
      setModalOpen(false);
      loadCategories();
    } catch (err) {
      message.error(errorMessage(err, 'Failed to save skill category'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (category: SkillCategory) => {
    try {
      await deleteSkillCategory(category.id);
      message.success('Skill category deleted');
      loadCategories();
    } catch (err) {
      message.error(errorMessage(err, 'Failed to delete skill category'));
    }
  };

  return (
    <Card
      title="Skill Categories"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
          Add Category
        </Button>
      }
    >
      <Table
        rowKey="id"
        loading={loading}
        dataSource={categories}
        columns={[
          { title: 'Name', dataIndex: 'name' },
          { title: 'Description', dataIndex: 'description', render: (v: string | null) => v ?? '—' },
          {
            title: 'Primary Weight',
            dataIndex: 'primaryWeight',
            render: (v: number) => <Tag color="gold">{v}</Tag>,
          },
          {
            title: 'Non-Primary Weight',
            dataIndex: 'secondaryWeight',
            render: (v: number) => <Tag>{v}</Tag>,
          },
          {
            title: 'Skills',
            dataIndex: 'skillCount',
            render: (v: number) => <Tag color={v > 0 ? 'blue' : 'default'}>{v}</Tag>,
          },
          {
            title: 'Priority',
            dataIndex: 'priority',
            render: (v: number) => <Tag color={PRIORITY_COLORS[v] ?? 'default'}>{v}</Tag>,
          },
          {
            title: 'Actions',
            render: (_, record: SkillCategory) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
                  Edit
                </Button>
                <Popconfirm
                  title="Delete this skill category?"
                  description="Blocked if any skill in the catalog still uses it."
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
        title={editingCategory ? 'Edit skill category' : 'Add skill category'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={saving}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true }]}
            tooltip={editingCategory ? 'Renaming updates every skill currently in this category.' : undefined}
          >
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item
            name="primaryWeight"
            label="Primary skill weight"
            initialValue={1}
            tooltip="Score weight applied to an employee's primary skill in this category, e.g. 1.0."
          >
            <InputNumber min={0} step={0.1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="secondaryWeight"
            label="Non-primary skill weight"
            initialValue={0.2}
            tooltip="Score weight applied to every other (non-primary) skill an employee has in this category, e.g. 0.2."
          >
            <InputNumber min={0} step={0.1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="priority"
            label="Learning-suggestion priority"
            initialValue={1}
            tooltip="How urgently employees with no skill here should be steered toward learning one — 1 (low) to 4 (highest)."
          >
            <InputNumber min={1} max={4} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
